"""语料 → 训练样本（协议层，仅依赖 numpy）。

样本结构（与 docs/model-io-protocol.md 一一对应）：
  条件: [cosθ, sinθ, log₂D, T, mode]   分辨率无关编码
  目标: 每步 [dt, dx, dy] 增量（插值到定长 SEQ_LEN=128）
  段标签: 弹道段(0) / 校正段(1) —— 两阶段教师强制
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

import numpy as np

SEQ_LEN = 128
FEATURE_DIM = 5  # cosθ, sinθ, log2D, T_norm, mode


@dataclass
class Sample:
    cond: np.ndarray  # (FEATURE_DIM,)
    steps: np.ndarray  # (SEQ_LEN, 3) dt, dx, dy（时间已归一，位移按距离归一）
    phase: np.ndarray  # (SEQ_LEN,) 0=弹道 1=校正


def trial_to_sample(points: list[list[float]], mode: int = 0) -> Sample | None:
    """单条 trial（[[t,x,y],...] 相对毫秒）→ 训练样本。

    - 轨迹按弧长均匀重采样到 SEQ_LEN 点（变长 → 定长）
    - 位移除以总距离（L3 归一空间）；时长除以总时长
    - 校正段判定：进入剩余距离 15% 之后的步（两阶段结构先验）
    """
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[0] < 3 or pts.shape[1] != 3:
        return None
    t = pts[:, 0]
    x, y = pts[:, 1], pts[:, 2]
    total_ms = float(t[-1] - t[0])
    if total_ms < 40:
        return None
    x = x - x[0]
    y = y - y[0]
    dist = float(np.hypot(x[-1], y[-1]))
    if dist < 1e-6:
        return None

    # 弧长均匀重采样
    seg = np.hypot(np.diff(x), np.diff(y))
    s = np.concatenate([[0.0], np.cumsum(seg)])
    s_target = np.linspace(0.0, s[-1], SEQ_LEN)
    rx = np.interp(s_target, s, x)
    ry = np.interp(s_target, s, y)

    # 时间亦按弧长插值（粗但稳定；真实数据的时间不均匀性由 dt 表达）
    rt = np.interp(s_target, s, t) - t[0]

    # 增量序列
    dt = np.diff(rt, prepend=rt[0])
    dx = np.diff(rx, prepend=0.0)
    dy = np.diff(ry, prepend=0.0)
    steps = np.stack([dt, dx, dy], axis=1)
    steps[:, 0] = np.maximum(steps[:, 0], 0.0)

    # 归一：位移 / 总距离；时间 / 总时长
    steps[:, 1] /= dist
    steps[:, 2] /= dist
    steps[:, 0] /= total_ms

    # 条件向量
    theta = math.atan2(float(y[-1]), float(x[-1]))
    cond = np.array(
        [
            math.cos(theta),
            math.sin(theta),
            math.log2(max(dist, 1.0)),
            min(total_ms / 3000.0, 1.0),  # T 归一（3s 上限）
            float(mode),
        ],
        dtype=np.float64,
    )

    # 两阶段标签：累计完成度 > 85% 之后为校正段
    progress = np.cumsum(np.hypot(np.diff(rx, prepend=0.0), np.diff(ry, prepend=0.0)))
    progress /= max(progress[-1], 1e-9)
    phase = (progress > 0.85).astype(np.float64)

    return Sample(cond=cond, steps=steps, phase=phase)


def load_corpus(path: str, mode: int = 0) -> list[Sample]:
    """JSONL 语料加载（匿名格式，见 packages/core/src/data/corpus.ts）。"""
    samples: list[Sample] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            trial = json.loads(line)
            s = trial_to_sample(trial["points"], mode=mode)
            if s is not None:
                samples.append(s)
    return samples


def batch(samples: list[Sample]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """样本列表 → (B, F) 条件 / (B, L, 3) 步 / (B, L) 段标签。"""
    conds = np.stack([s.cond for s in samples])
    steps = np.stack([s.steps for s in samples])
    phase = np.stack([s.phase for s in samples])
    return conds, steps, phase
