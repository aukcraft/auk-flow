/**
 * 区间采样器与点击落点分布（spec humanize-pass）。
 */

/** 可播种 RNG（index.defaultRng 的独立导出便于测试注入） */
export type Rng = () => number;

/** 数值区间采样：每次运行重新采样（spec：非恒定时序） */
export class IntervalSampler {
  constructor(private rng: Rng) {}

  sample(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  /** wait 原语：区间取采样值，固定值原样返回 */
  waitMs(ms: number | { min: number; max: number }): number {
    return typeof ms === "number" ? ms : this.sample(ms.min, ms.max);
  }

  /** 区间中值（humanize off 精确模式） */
  static midpoint(ms: number | { min: number; max: number }): number {
    return typeof ms === "number" ? ms : (ms.min + ms.max) / 2;
  }
}

/**
 * 点击落点分布：以目标中心为中心、向中心集中（spec 落点分布场景）。
 * 实现：二维高斯偏移（Box-Muller），σ 随目标宽度缩放，超出最大半径则拒绝重采样。
 * 高斯在中心的密度最高、向外衰减 —— 真人点按钮的落点形态。
 */
export class LandingDistribution {
  /** 落点最大偏移占目标半宽的比例 */
  private static readonly SPREAD = 0.35;

  constructor(private rng: Rng) {}

  sample(center: { x: number; y: number }, targetWidthPx: number): { x: number; y: number } {
    const rMax = (targetWidthPx / 2) * LandingDistribution.SPREAD;
    const sigma = rMax / 2;
    for (;;) {
      // Box-Muller
      const u1 = Math.max(this.rng(), 1e-12);
      const u2 = this.rng();
      const mag = Math.sqrt(-2 * Math.log(u1)) * sigma;
      const theta = u2 * Math.PI * 2;
      const dx = Math.cos(theta) * mag;
      const dy = Math.sin(theta) * mag;
      if (Math.hypot(dx, dy) <= rMax) {
        return { x: center.x + dx, y: center.y + dy };
      }
    }
  }

  /** 精确模式：恒定中心（spec: 落点不恒等于中心 仅拟人模式约束） */
  static exact(center: { x: number; y: number }): { x: number; y: number } {
    return { ...center };
  }
}
