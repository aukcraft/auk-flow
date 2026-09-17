"""评估协议（spec model-io-protocol: 验收）。

1. 分布对比：生成 vs 真迹 —— 速度剖面/曲率分布/总时长分布（Wasserstein 距离）
2. 判别器检验：二分类器区分真迹 vs 生成，通过线 AUC ≈ 0.5

用法: python -m auk_train.evaluate --corpus data.jsonl --model checkpoints/auk_traj.pt
"""

from __future__ import annotations

import argparse

import numpy as np
import torch

from .data import batch, load_corpus
from .model import TrajectoryLSTM, generate


def feature_of(steps: np.ndarray) -> np.ndarray:
    """轨迹的分布特征向量（速度分位数 + 曲率均值 + 总时长/步数）。"""
    dt = np.maximum(steps[:, 0], 1e-6)
    v = np.hypot(steps[:, 1], steps[:, 2]) / dt
    dx, dy = steps[:, 1], steps[:, 2]
    with np.errstate(invalid="ignore", divide="ignore"):
        curv = np.abs(dx * np.roll(dy, -1) - dy * np.roll(dx, -1)) / (
            np.hypot(dx, dy) * np.roll(np.hypot(dx, dy), -1) + 1e-9
        )
        curv = curv[~np.isnan(curv)]
    return np.concatenate(
        [
            np.quantile(v, [0.1, 0.25, 0.5, 0.75, 0.9]),
            [curv.mean() if len(curv) else 0.0],
            [steps[:, 0].sum()],
            [len(steps)],
        ]
    )


def wasserstein1d(a: np.ndarray, b: np.ndarray) -> float:
    """1D Wasserstein（分布对比的距离摘要）。"""
    ua, ub = np.sort(a.ravel()), np.sort(b.ravel())
    n = max(len(ua), len(ub))
    qa = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(ua)), ua)
    qb = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(ub)), ub)
    return float(np.abs(qa - qb).mean())


def discriminator_auc(real_feat: np.ndarray, gen_feat: np.ndarray, seed: int = 7) -> float:
    """逻辑回归判别器 + 5 折 AUC（特征可分 = 模型露馅）。"""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import StratifiedKFold
    from sklearn.preprocessing import StandardScaler

    x = np.concatenate([real_feat, gen_feat])
    y = np.concatenate([np.ones(len(real_feat)), np.zeros(len(gen_feat))])
    aucs: list[float] = []
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    for tr, te in skf.split(x, y):
        sc = StandardScaler().fit(x[tr])
        clf = LogisticRegression(max_iter=1000).fit(sc.transform(x[tr]), y[tr])
        p = clf.predict_proba(sc.transform(x[te]))[:, 1]
        aucs.append(roc_auc_score(y[te], p))
    return float(np.mean(aucs))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--n-gen", type=int, default=100)
    ap.add_argument("--auc-tolerance", type=float, default=0.05)
    args = ap.parse_args()

    samples = load_corpus(args.corpus)
    conds, steps, _ = batch(samples)
    ckpt = torch.load(args.model, map_location="cpu", weights_only=False)
    model = TrajectoryLSTM(cond_dim=ckpt.get("cond_dim", 5))
    model.load_state_dict(ckpt["state_dict"])

    # 生成样本（条件取自真实语料的分布）
    rng = torch.Generator().manual_seed(123)
    gen_steps: list[np.ndarray] = []
    idx = np.random.RandomState(0).choice(len(samples), args.n_gen)
    for i in idx:
        cond = torch.tensor(conds[i], dtype=torch.float32).unsqueeze(0)
        seq = generate(model, cond, temperature=1.0, rng=rng)
        gen_steps.append(np.asarray(seq))

    real_feat = np.stack([feature_of(s) for s in steps])
    gen_feat = np.stack([feature_of(s) for s in gen_steps])

    # 1) 分布对比
    print("== 分布对比（Wasserstein，越小越像）==")
    names = ["速度剖面", "曲率", "总时长", "步数"]
    cols = [(slice(0, 5), None), (5, None), (6, None), (7, None)]
    for name, (c, _) in zip(names, cols):
        print(f"  {name}: {wasserstein1d(real_feat[:, c].ravel(), gen_feat[:, c].ravel()):.4f}")

    # 2) 判别器
    auc = discriminator_auc(real_feat, gen_feat)
    print(f"== 判别器 AUC: {auc:.3f}（通过线 0.5±{args.auc_tolerance}）==")
    if abs(auc - 0.5) <= args.auc_tolerance:
        print("PASS: 生成与真迹不可分")
    else:
        print("FAIL: 判别器可区分 —— 模型露馅")


if __name__ == "__main__":
    main()
