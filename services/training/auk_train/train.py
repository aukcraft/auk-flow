"""训练入口。

用法：
  # 1) 管线过拟合验证（50 条，loss 必须显著下降 —— 概念文档 6.4）
  python -m auk_train.train --corpus data.jsonl --overfit 50

  # 2) 全量训练
  python -m auk_train.train --corpus data.jsonl --epochs 200

  # 3) 合成数据自检（无真实语料时验证代码路径）
  python -m auk_train.train --synthetic 200 --epochs 30
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import torch

from .data import FEATURE_DIM, batch, load_corpus
from .model import TrajectoryLSTM, nll_loss
from . import synthetic


def teacher_force(steps: np.ndarray) -> np.ndarray:
    """目标序列右移一位（首步用零填充）作为输入。"""
    z = np.zeros_like(steps[:, :1, :])
    return np.concatenate([z, steps[:, :-1, :]], axis=1)


def run_training(
    conds: np.ndarray,
    steps: np.ndarray,
    phase: np.ndarray,
    epochs: int,
    lr: float = 1e-3,
    device: str = "cpu",
    log_every: int = 10,
) -> tuple[TrajectoryLSTM, list[float]]:
    model = TrajectoryLSTM(cond_dim=conds.shape[1]).to(device)
    print(f"model params: {model.n_params:,}")
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    t_cond = torch.tensor(conds, dtype=torch.float32, device=device)
    t_steps = torch.tensor(steps, dtype=torch.float32, device=device)
    t_phase = torch.tensor(phase, dtype=torch.float32, device=device)
    t_in = torch.tensor(teacher_force(steps), dtype=torch.float32, device=device)

    losses: list[float] = []
    for ep in range(epochs):
        opt.zero_grad()
        out, p_eos = model(t_cond, t_in, t_phase)
        loss = nll_loss(out, p_eos, t_steps, t_phase)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        opt.step()
        losses.append(loss.item())
        if (ep + 1) % log_every == 0 or ep == 0:
            print(f"epoch {ep + 1}/{epochs}  nll={loss.item():.4f}")
    return model, losses


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", type=str, help="JSONL 语料路径")
    ap.add_argument("--synthetic", type=int, metavar="N", help="生成 N 条合成数据自检")
    ap.add_argument("--overfit", type=int, help="只用前 N 条（过拟合验证）")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--out", type=str, default="checkpoints/auk_traj.pt")
    args = ap.parse_args()

    if args.synthetic and not args.corpus:
        path = "synthetic_corpus.jsonl"
        synthetic.write_synthetic_corpus(path, args.synthetic)
        print(f"synthetic corpus → {path} ({args.synthetic} trials)")
        args.corpus = path

    if not args.corpus:
        ap.error("需要 --corpus 或 --synthetic")

    samples = load_corpus(args.corpus)
    if not samples:
        raise SystemExit("语料为空或全部无法解析")
    if args.overfit:
        samples = samples[: args.overfit]
    conds, steps, phase = batch(samples)
    print(f"samples: {len(samples)}  cond: {conds.shape}  steps: {steps.shape}")

    model, losses = run_training(conds, steps, phase, args.epochs, lr=args.lr)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "cond_dim": conds.shape[1],
            "losses": losses,
            "final_nll": losses[-1] if losses else math.inf,
        },
        out,
    )
    drop = (losses[0] - losses[-1]) / max(losses[0], 1e-9) * 100
    print(f"saved → {out}  loss {losses[0]:.3f} → {losses[-1]:.3f} (↓{drop:.0f}%)")
    if args.overfit and drop < 30:
        raise SystemExit("过拟合验证失败：loss 未显著下降，管线有问题")
    print("overfit check: OK" if args.overfit else "done")


if __name__ == "__main__":
    main()
