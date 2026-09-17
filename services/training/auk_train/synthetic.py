"""合成轨迹生成器（WindMouse Python 版）。

用途：在真实语料到位前跑通训练/评估全管线（概念文档 6.4：
"先 50 条过拟合验证管线"）。参数带分布扰动，与 core TS 侧 V1 内核同源。
"""

from __future__ import annotations

import json
import math
import random

SEQ_WINDOW = (1920, 1080)


def windmouse_trial(
    dist: float | None = None,
    theta_deg: float | None = None,
    rng: random.Random | None = None,
) -> list[list[float]]:
    """生成一条 [t,x,y] 轨迹（相对毫秒）。"""
    rng = rng or random.Random()
    dist = dist if dist is not None else rng.uniform(80, 1200)
    theta = math.radians(theta_deg if theta_deg is not None else rng.uniform(0, 360))

    gravity = rng.uniform(8, 12)
    wind_max = rng.uniform(2, 5)
    max_step = rng.uniform(8, 14)

    x, y = rng.uniform(100, 800), rng.uniform(100, 800)
    aim_x = x + math.cos(theta) * dist
    aim_y = y + math.sin(theta) * dist
    vx = vy = 0.0
    t = 0.0
    pts: list[list[float]] = [[0.0, x, y]]
    guard = 0
    while guard < 2000:
        guard += 1
        rem_x, rem_y = aim_x - x, aim_y - y
        rem = math.hypot(rem_x, rem_y)
        if rem < 0.6:
            break
        wind_scale = min(1.0, rem / 160)
        vx += rng.uniform(-1, 1) * wind_max * wind_scale
        vy += rng.uniform(-1, 1) * wind_max * wind_scale
        vx = vx * 0.72 + (rem_x / rem) * gravity * wind_scale
        vy = vy * 0.72 + (rem_y / rem) * gravity * wind_scale
        dx, dy = vx, vy
        step_len = math.hypot(dx, dy)
        if step_len > max_step:
            dx, dy = dx / step_len * max_step, dy / step_len * max_step
        if rem < 12:
            dx, dy = rem_x * 0.35, rem_y * 0.35
        dt = max(3.0, 8 * rng.uniform(0.8, 1.2))
        x += dx
        y += dy
        t += dt
        pts.append([round(t, 2), round(x, 2), round(y, 2)])
    # 点击前犹豫
    t += rng.uniform(80, 300)
    pts.append([round(t, 2), round(x, 2), round(y, 2)])
    return pts


def write_synthetic_corpus(path: str, n: int, seed: int = 42) -> None:
    """生成 JSONL 合成语料（匿名格式，字段与真实语料一致）。"""
    rng = random.Random(seed)
    with open(path, "w", encoding="utf-8") as f:
        for _ in range(n):
            trial = windmouse_trial(rng=rng)
            dist = math.hypot(trial[-1][1] - trial[0][1], trial[-1][2] - trial[0][2])
            theta = math.degrees(math.atan2(trial[-1][2] - trial[0][2], trial[-1][1] - trial[0][1]))
            f.write(
                json.dumps(
                    {
                        "points": trial,
                        "dist": round(dist),
                        "angle": round(theta),
                        "duration": round(trial[-1][0]),
                        "device": "mouse",
                    }
                )
                + "\n"
            )
