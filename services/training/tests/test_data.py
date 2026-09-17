"""数据管线测试（纯 numpy，无 torch 依赖）。"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from auk_train.data import SEQ_LEN, batch, load_corpus, trial_to_sample  # noqa: E402
from auk_train.synthetic import windmouse_trial, write_synthetic_corpus  # noqa: E402


def test_trial_to_sample_shapes_and_norm():
    pts = windmouse_trial(dist=500, theta_deg=30)
    s = trial_to_sample(pts)
    assert s is not None
    assert s.steps.shape == (SEQ_LEN, 3)
    assert s.cond.shape == (5,)
    # 条件编码：方向正确（cos/sin 与终位移方向一致）
    dx, dy = pts[-1][1] - pts[0][1], pts[-1][2] - pts[0][2]
    d = np.hypot(dx, dy)
    assert abs(s.cond[0] - dx / d) < 1e-9
    assert abs(s.cond[1] - dy / d) < 1e-9
    # 位移归一：增量累计 = 单位位移向量
    sx, sy = s.steps[:, 1].sum(), s.steps[:, 2].sum()
    assert abs(sx - dx / d) < 1e-6
    assert abs(sy - dy / d) < 1e-6
    # 时间归一：dt 之和 = 1
    assert abs(s.steps[:, 0].sum() - 1.0) < 1e-6
    # 两阶段标签：末段有校正、前段有弹道
    assert s.phase[0] == 0.0
    assert s.phase[-1] == 1.0


def test_degenerate_trials_rejected():
    assert trial_to_sample([[0, 1, 1]]) is None
    assert trial_to_sample([[0, 1, 1], [10, 1, 1], [20, 1, 1]]) is None  # 零距离
    assert trial_to_sample([[0, 1, 1], [5, 2, 2], [10, 3, 3]]) is None  # <40ms


def test_corpus_roundtrip(tmp_path):
    p = tmp_path / "c.jsonl"
    write_synthetic_corpus(str(p), 20)
    samples = load_corpus(str(p))
    assert len(samples) >= 15  # 个别退化 trial 可能被拒
    conds, steps, phase = batch(samples)
    assert conds.shape == (len(samples), 5)
    assert steps.shape == (len(samples), SEQ_LEN, 3)
    assert phase.shape == (len(samples), SEQ_LEN)


def test_synthetic_trials_are_not_uniform_lines():
    """合成轨迹非直线匀速（与 core TS 侧同一验收精神）。"""
    pts = windmouse_trial(dist=800)
    seg_dirs = [
        np.degrees(np.arctan2(pts[i + 1][2] - pts[i][2], pts[i + 1][1] - pts[i][1]))
        for i in range(len(pts) - 1)
        if np.hypot(pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]) > 0.5
    ]
    spread = np.ptp(seg_dirs)
    assert spread > 1.0  # 方向有变化
