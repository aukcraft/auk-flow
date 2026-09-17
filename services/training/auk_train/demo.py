"""生成虚拟轨迹演示数据（训练模型 → 采样 → 像素空间 JSON）。

用法：
  # 一条龙：合成语料 → 训练 → 采样 → demo_trajectories.json（查看器吃这个）
  python -m auk_train.demo --synthetic 400 --epochs 120 --out ../tools/traj-viewer/demo_trajectories.json

  # 用已有 checkpoint
  python -m auk_train.demo --model checkpoints/auk_traj.pt --corpus synthetic_corpus.jsonl --out demo.json
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import torch

from . import synthetic
from .data import batch, load_corpus
from .model import TrajectoryLSTM, generate
from .train import run_training


def denormalize(seq: list[tuple[float, float, float]], dist_px: float, duration_ms: float) -> list[list[float]]:
    """归一化增量 → [t, x, y] 像素轨迹（乘回距离/时长）。"""
    t = x = y = 0.0
    pts = [[0.0, 0.0, 0.0]]
    for dt, dx, dy in seq:
        t += dt * duration_ms
        x += dx * dist_px
        y += dy * dist_px
        pts.append([round(t, 2), round(x, 2), round(y, 2)])
    return pts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--synthetic", type=int, metavar="N", help="合成 N 条语料并训练")
    ap.add_argument("--corpus", type=str, help="语料路径（提供条件分布）")
    ap.add_argument("--model", type=str, default="checkpoints/auk_traj.pt")
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--n-gen", type=int, default=24, help="生成条数")
    ap.add_argument("--out", type=str, default="demo_trajectories.json")
    args = ap.parse_args()

    if args.synthetic:
        args.corpus = "synthetic_corpus.jsonl"
        synthetic.write_synthetic_corpus(args.corpus, args.synthetic)
        samples = load_corpus(args.corpus)
        conds, steps, phase = batch(samples)
        print(f"训练: {len(samples)} 条合成 / {args.epochs} epochs ...")
        model, losses = run_training(conds, steps, phase, args.epochs, lr=5e-4, log_every=max(args.epochs // 6, 1))
        ckpt_path = Path(args.model)
        ckpt_path.parent.mkdir(parents=True, exist_ok=True)
        torch.save({"state_dict": model.state_dict(), "cond_dim": 5, "losses": losses}, ckpt_path)
        print(f"checkpoint → {ckpt_path}")
    else:
        ckpt = torch.load(args.model, map_location="cpu", weights_only=False)
        model = TrajectoryLSTM(cond_dim=ckpt.get("cond_dim", 5))
        model.load_state_dict(ckpt["state_dict"])
        if not args.corpus:
            ap.error("非训练模式需要 --corpus 提供条件分布")

    samples = load_corpus(args.corpus)
    conds, _, _ = batch(samples)

    # 采样：条件从语料分布抽取（距离/角度/时长真实多样）
    rng = torch.Generator().manual_seed(2024)
    idx = np.random.RandomState(7).choice(len(samples), args.n_gen)
    out = []
    for i in idx:
        cond = torch.tensor(conds[i], dtype=torch.float32).unsqueeze(0)
        seq = generate(model, cond, temperature=0.9, rng=rng)
        dist_px = float(2 ** cond[0, 2].item())  # log₂D 还原
        duration_ms = float(cond[0, 3].item() * 3000.0)
        pts = denormalize(seq, dist_px, duration_ms)
        # 平移到画布内随机起点
        ox, oy = np.random.uniform(120, 700), np.random.uniform(120, 700)
        pts = [[t, x + ox, y + oy] for t, x, y in pts]
        theta = math.degrees(math.atan2(cond[0, 1].item(), cond[0, 0].item()))
        out.append(
            {
                "source": "generated",
                "dist": round(dist_px),
                "angle": round(theta),
                "duration": round(pts[-1][0]),
                "points": pts,
            }
        )
    # 同场对比：附几条真实（合成）轨迹
    for i in idx[: args.n_gen // 3]:
        out.append({"source": "reference", **{"dist": 0, "angle": 0, "duration": 0, "points": samples[i].steps.tolist() and _ref_pts(samples, i)}})

    import json

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"生成 {args.n_gen} 条虚拟轨迹 + 参考轨迹 → {args.out}")


def _ref_pts(samples, i):
    """把归一化样本还原成展示轨迹（近似：乘典型距离/时长）。"""
    s = samples[i]
    dist = 400.0
    dur = 800.0
    t = x = y = 0.0
    pts = [[0.0, 0.0, 0.0]]
    ox, oy = 200.0, 600.0
    for dt, dx, dy in s.steps:
        t += dt * dur
        x += dx * dist + ox
        y += dy * dist + oy
        pts.append([round(t, 2), round(x, 2), round(y, 2)])
    return pts


if __name__ == "__main__":
    main()
