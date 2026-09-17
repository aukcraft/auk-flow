"""ONNX 导出（Rust ort 侧加载）。

用法: python -m auk_train.export_onnx checkpoints/auk_traj.pt
产物: checkpoints/auk_traj.onnx
输入: cond (1, 5) float32, steps_in (1, L, 3) float32, phase_in (1, L) float32
输出: out (1, L, 6), p_eos (1, L)
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

from .data import SEQ_LEN
from .model import TrajectoryLSTM


def export(pt_path: str, out_path: str | None = None) -> str:
    ckpt = torch.load(pt_path, map_location="cpu", weights_only=False)
    model = TrajectoryLSTM(cond_dim=ckpt.get("cond_dim", 5))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    cond = torch.zeros(1, ckpt.get("cond_dim", 5))
    steps_in = torch.zeros(1, SEQ_LEN, 3)
    phase_in = torch.zeros(1, SEQ_LEN)

    out_path = out_path or str(Path(pt_path).with_suffix(".onnx"))
    torch.onnx.export(
        model,
        (cond, steps_in, phase_in),
        out_path,
        input_names=["cond", "steps_in", "phase_in"],
        output_names=["out", "p_eos"],
        dynamic_axes={
            "steps_in": {0: "batch", 1: "seq"},
            "phase_in": {0: "batch", 1: "seq"},
            "out": {0: "batch", 1: "seq"},
            "p_eos": {0: "batch", 1: "seq"},
        },
        opset_version=17,
        dynamo=False,  # legacy 导出器：LSTM 元组隐状态在 dynamo 路径不可 trace
    )
    print(f"exported → {out_path}")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: python -m auk_train.export_onnx <model.pt> [out.onnx]")
    export(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
