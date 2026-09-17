"""LSTM 轨迹模型（30~50 万参数，NLL 损失，学分布不学均值）。

输出每步 4 维 (μx, μy, σx, σy)：
  - 位移增量 dx/dy 用高斯 N(μ, σ²) 建模
  - dt 用对数正态（保证正值）：NLL 在 log 空间计算
  - EOS 头 p_eos（sigmoid），EOS 判据 = 位移趋零且 dt 拉长
两阶段教师强制：phase 输入 (1 维) 让模型显式区分弹道/校正段。
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn

HIDDEN = 192
LAYERS = 1


class TrajectoryLSTM(nn.Module):
    def __init__(self, cond_dim: int = 5, hidden: int = HIDDEN):
        super().__init__()
        self.cond_proj = nn.Linear(cond_dim, hidden)
        # 输入: dt, dx, dy, phase, cond_proj 已并入 h0 → 这里只放序列特征
        self.lstm = nn.LSTM(input_size=4, hidden_size=hidden, num_layers=LAYERS, batch_first=True)
        self.head = nn.Linear(hidden, 6)  # μx, μy, σx, σy, μlogdt, σlogdt
        self.eos_head = nn.Linear(hidden, 1)
        n_params = sum(p.numel() for p in self.parameters())
        self.n_params = n_params

    def forward(self, cond: torch.Tensor, steps_in: torch.Tensor, phase_in: torch.Tensor):
        """
        cond:     (B, cond_dim)
        steps_in: (B, L, 3) dt,dx,dy —— 教师强制输入（目标序列右移一位）
        phase_in: (B, L) 段标签
        返回: out (B, L, 6), p_eos (B, L)
        """
        b, l, _ = steps_in.shape
        h0 = torch.tanh(self.cond_proj(cond)).repeat(LAYERS, 1, 1)
        c0 = torch.zeros_like(h0)
        feats = torch.cat([steps_in, phase_in.unsqueeze(-1)], dim=-1)  # (B, L, 4)
        out, _ = self.lstm(feats, (h0, c0))
        return self.head(out), torch.sigmoid(self.eos_head(out))


MIN_SIGMA = 1e-4


def nll_loss(
    out: torch.Tensor,
    p_eos: torch.Tensor,
    steps_target: torch.Tensor,
    phase_target: torch.Tensor,
) -> torch.Tensor:
    """高斯 NLL（dx/dy）+ 对数正态 NLL（dt）+ EOS BCE。学分布的关键。"""
    mu_x, mu_y = out[..., 0], out[..., 1]
    sigma_x = out[..., 2].clamp_min(MIN_SIGMA) + 1e-3
    sigma_y = out[..., 3].clamp_min(MIN_SIGMA) + 1e-3
    mu_ldt, sigma_ldt = out[..., 4], out[..., 5].clamp_min(MIN_SIGMA) + 1e-3

    dt, dx, dy = steps_target[..., 0], steps_target[..., 1], steps_target[..., 2]

    def gauss_nll(mu: torch.Tensor, sigma: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        return torch.log(sigma) + 0.5 * ((target - mu) / sigma) ** 2

    nll = gauss_nll(mu_x, sigma_x, dx) + gauss_nll(mu_y, sigma_y, dy)
    # dt > 0 → log 空间（对数正态）
    dt_safe = dt.clamp_min(1e-6)
    nll = nll + gauss_nll(mu_ldt, sigma_ldt, torch.log(dt_safe))

    # EOS 目标：最后一步为 1，其余为 0（简化；校正段结束即 EOS）
    eos_target = torch.zeros_like(p_eos)
    eos_target[:, -1] = 1.0
    eos_bce = nn.functional.binary_cross_entropy(p_eos, eos_target)
    return nll.mean() + eos_bce


@torch.no_grad()
def generate(
    model: TrajectoryLSTM,
    cond: torch.Tensor,
    max_steps: int = 128,
    temperature: float = 1.0,
    rng: torch.Generator | None = None,
) -> list[tuple[float, float, float]]:
    """采样生成（勿取 μ！spec model-io-protocol）。

    逐步采样 → 返回 [(dt, dx, dy), ...] 归一化增量序列。
    终点硬约束兜底由调用方（humanize-pass）负责。
    """
    model.eval()
    b = cond.shape[0]
    assert b == 1, "生成按单条进行"
    h = torch.tanh(model.cond_proj(cond)).repeat(LAYERS, 1, 1)
    c = torch.zeros_like(h)
    # 起步输入：零增量、弹道段
    step_in = torch.zeros(1, 1, 4)
    out_seq: list[tuple[float, float, float]] = []
    for i in range(max_steps):
        out, (h, c) = model.lstm(step_in, (h, c))
        head = model.head(out)  # (1,1,6)
        p_eos = torch.sigmoid(model.eos_head(out)).item()
        mu = head[0, 0, :2]
        sigma = (head[0, 0, 2:4].clamp_min(0) + 1e-3) * temperature
        dx, dy = (mu + torch.randn(2, generator=rng) * sigma).tolist()
        mu_ldt = head[0, 0, 4]
        sigma_ldt = (head[0, 0, 5].clamp_min(0) + 1e-3) * temperature
        dt = math.exp(mu_ldt + torch.randn(1, generator=rng).item() * sigma_ldt)
        out_seq.append((dt, dx, dy))
        # 下一步输入（教师强制切换为自回归）
        phase = 1.0 if i > max_steps * 0.85 else 0.0
        step_in = torch.tensor([[[dt, dx, dy, phase]]], dtype=torch.float32)
        if p_eos > 0.5 and i > 8:
            break
    return out_seq
