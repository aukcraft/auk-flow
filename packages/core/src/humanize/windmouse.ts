/**
 * V1 规则内核：WindMouse 轨迹 + Fitts 时序 + 两阶段结构（弹道/过冲回调）。
 *
 * WindMouse（Benjamin J. 风+重力模型）：
 *   - 重力把光标拉向目标（比例于剩余距离）
 *   - 风（随机游走向量）注入横向扰动，随剩余距离衰减
 *   - 距目标越近步长越小 → 自带"大致瞄准 + 微调"两阶段
 *
 * 本实现的参数为分布而非常量（spec 5.5：稳定像 A = 固定指纹）：
 * gravity/windMax/maxStep 每次生成都重新采样。
 */

import type { HumanizeKernel, HumanizeProfile, MoveContext, MoveRequest, MoveStep } from "./index.ts";
import type { IntervalSampler, LandingDistribution, Rng } from "./sampler.ts";

/** Fitts 定律：T = a + b·log₂(D/W + 1)，参数每次生成带分布扰动 */
export class FittsTimer {
  constructor(
    private base: { a: number; b: number; w: number },
    private jitterRatio = 0.15,
  ) {}

  estimateMs(distancePx: number, targetWidthPx: number, rng: Rng): number {
    const { a, b } = this.base;
    const id = Math.log2(distancePx / Math.max(targetWidthPx, this.base.w) + 1);
    const central = a + b * id;
    const jitter = 1 + (rng() * 2 - 1) * this.jitterRatio;
    return Math.max(central * jitter, 20);
  }
}

/** 风格档位参数分布（age/style 条件生成的钩子 —— V2 标定接入点） */
interface WindParams {
  gravity: number;
  windMax: number;
  maxStep: number;
}

function sampleParams(rng: Rng, profile?: HumanizeProfile): WindParams {
  // 基础分布（真人范围）；profile 在 V2 由标定拟合结果替换
  const u = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const slow = profile?.style === "calm" || (profile?.age ? /5[5-9]|6[0-9]/.test(profile.age) : false);
  return {
    gravity: u(8, 12) * (slow ? 0.8 : 1),
    windMax: u(2, 5) * (slow ? 0.7 : 1),
    maxStep: u(8, 14),
  };
}

export class WindMouseKernel implements HumanizeKernel {
  readonly id = "windmouse";

  constructor(
    private fitts: FittsTimer,
    private sampler: IntervalSampler,
    private landing: LandingDistribution,
    private rng: Rng,
  ) {}

  async generate(req: MoveRequest, _ctx?: MoveContext, profile?: HumanizeProfile): Promise<MoveStep[]> {
    const { from } = req;
    const w = req.targetWidthPx ?? 24;
    // 落点分布先于轨迹（spec：目标点本身也是拟人化对象）
    const aim = this.landing.sample(req.to, w);
    const totalMs = this.fitts.estimateMs(Math.hypot(aim.x - from.x, aim.y - from.y), w, this.rng);
    return this.trace(from, aim, totalMs, profile);
  }

  private trace(from: { x: number; y: number }, aim: { x: number; y: number }, totalMs: number, profile?: HumanizeProfile): MoveStep[] {
    const params = sampleParams(this.rng, profile);
    let x = from.x, y = from.y;
    let vx = 0, vy = 0; // 风向量（随机游走）
    const steps: MoveStep[] = [];
    let elapsed = 0;

    // 时间预算 → 平均步数：以 maxStep 与总时长共同约束节奏
    const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
    const nSteps = Math.max(6, Math.min(120, Math.round(dist / (params.maxStep * 0.6))));
    const dt = Math.max(4, Math.round(totalMs / nSteps));

    let guard = 0;
    while (elapsed < totalMs && guard++ < 2000) {
      const remX = aim.x - x, remY = aim.y - y;
      const remDist = Math.hypot(remX, remY);
      if (remDist < 0.6) break;

      // 风衰减于剩余距离
      const windScale = Math.min(1, remDist / 160);
      vx += (this.rng() * 2 - 1) * params.windMax * windScale;
      vy += (this.rng() * 2 - 1) * params.windMax * windScale;
      // 阻尼 + 重力
      vx = vx * 0.72 + (remX / remDist) * params.gravity * windScale;
      vy = vy * 0.72 + (remY / remDist) * params.gravity * windScale;

      let dx = vx, dy = vy;
      const stepLen = Math.hypot(dx, dy);
      if (stepLen > params.maxStep) {
        dx = (dx / stepLen) * params.maxStep;
        dy = (dy / stepLen) * params.maxStep;
      }
      // 收尾微调：近处强制小步（两阶段结构的校正段）
      if (remDist < 12) {
        dx = remX * 0.35;
        dy = remY * 0.35;
      }
      // 步间 dt 微变（非匀速）
      const dtVar = Math.max(3, Math.round(dt * (0.8 + this.rng() * 0.4)));
      steps.push({ dt: dtVar, dx, dy });
      x += dx;
      y += dy;
      elapsed += dtVar;
    }

    // 点击前犹豫（80~300ms，spec 5.1）
    steps.push({ dt: Math.round(80 + this.rng() * 220), dx: 0, dy: 0 });
    return steps;
  }
}

// ---------- 精确模式（humanize off：确定性直线） ----------

export interface PreciseMove {
  steps: MoveStep[];
  /** 直线路径的中间点（等间隔、匀速）—— 用于精确模式派发 */
}

/** 精确模式：直线路径 + 固定步时（同输入 → 同输出，回归基线） */
export function preciseMove(from: { x: number; y: number }, to: { x: number; y: number }, stepPx = 10, dtMs = 8): PreciseMove {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(dist / stepPx));
  const ux = (to.x - from.x) / n;
  const uy = (to.y - from.y) / n;
  const steps: MoveStep[] = [];
  for (let i = 0; i < n; i++) steps.push({ dt: dtMs, dx: ux, dy: uy });
  return { steps };
}
