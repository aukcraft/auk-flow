import { describe, expect, it } from "vitest";
import {
  createDefaultKernel,
  defaultRng,
  preciseMove,
  type MoveStep,
} from "../src/humanize/index.ts";
import { IntervalSampler, LandingDistribution } from "../src/humanize/sampler.ts";
import { FittsTimer } from "../src/humanize/windmouse.ts";

function speedProfiles(steps: MoveStep[]): number[] {
  // 每步速度 px/ms
  return steps.map((s) => Math.hypot(s.dx, s.dy) / Math.max(s.dt, 1));
}

function isStraightLineUniform(steps: MoveStep[]): boolean {
  const speeds = speedProfiles(steps.filter((s) => s.dx !== 0 || s.dy !== 0));
  const dirs = steps
    .filter((s) => Math.hypot(s.dx, s.dy) > 0.5)
    .map((s) => Math.atan2(s.dy, s.dx));
  const dirSpread = Math.max(...dirs) - Math.min(...dirs);
  const speedSpread = Math.max(...speeds) - Math.min(...speeds);
  return dirSpread < 1e-6 && speedSpread < 1e-6;
}

describe("V1 规则内核（spec humanize-pass）", () => {
  const kernel = createDefaultKernel();
  const from = { x: 100, y: 100 };

  it("同一 (起点,终点) 连续 10 条轨迹两两不同且非直线匀速（spec: 轨迹非直线匀速）", async () => {
    const runs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const steps = await kernel.generate({ from, to: { x: 900, y: 600 }, targetWidthPx: 40 });
      expect(isStraightLineUniform(steps)).toBe(false);
      runs.push(JSON.stringify(round3(steps)));
    }
    expect(new Set(runs).size).toBe(10);
  });

  it("同一距离 100 次生成的总时长 CV > 0.05（spec: 时长分布）", async () => {
    const totals: number[] = [];
    for (let i = 0; i < 100; i++) {
      const steps = await kernel.generate({ from, to: { x: 700, y: 500 }, targetWidthPx: 40 });
      totals.push(steps.reduce((s, st) => s + st.dt, 0));
    }
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const sd = Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length);
    expect(sd / mean).toBeGreaterThan(0.05);
  });

  it("轨迹终点收敛到目标（物理正确性）", async () => {
    for (let i = 0; i < 5; i++) {
      const steps = await kernel.generate({ from, to: { x: 620, y: 415 }, targetWidthPx: 40 });
      let x = from.x, y = from.y;
      for (const s of steps) {
        x += s.dx;
        y += s.dy;
      }
      expect(Math.hypot(x - 620, y - 415)).toBeLessThan(8); // 落点分布 SPREAD=0.35*20=7 + 余量
    }
  });

  it("点击前犹豫停顿存在（80~300ms，spec 5.1）", async () => {
    const steps = await kernel.generate({ from, to: { x: 500, y: 300 }, targetWidthPx: 40 });
    const last = steps.at(-1)!;
    expect(last.dx).toBe(0);
    expect(last.dy).toBe(0);
    expect(last.dt).toBeGreaterThanOrEqual(80);
    expect(last.dt).toBeLessThanOrEqual(300);
  });
});

describe("精确模式（spec: humanize off 确定性）", () => {
  it("同输入两次生成完全一致（回归基线）", () => {
    const a = preciseMove({ x: 0, y: 0 }, { x: 300, y: 400 });
    const b = preciseMove({ x: 0, y: 0 }, { x: 300, y: 400 });
    expect(a.steps).toEqual(b.steps);
    // 步进和恰为总位移
    const sum = a.steps.reduce((s, st) => ({ x: s.x + st.dx, y: s.y + st.dy }), { x: 0, y: 0 });
    expect(Math.abs(sum.x - 300)).toBeLessThan(1e-9);
    expect(Math.abs(sum.y - 400)).toBeLessThan(1e-9);
  });
});

describe("落点分布（spec: 落点分布）", () => {
  it("200 次落点散布且向中心集中（无恒等于中心）", () => {
    const rng = defaultRng();
    const land = new LandingDistribution(rng);
    const center = { x: 500, y: 300 };
    const dists: number[] = [];
    for (let i = 0; i < 200; i++) {
      const p = land.sample(center, 40);
      dists.push(Math.hypot(p.x - center.x, p.y - center.y));
    }
    const atCenter = dists.filter((d) => d === 0).length;
    expect(atCenter).toBeLessThan(200); // 不恒等于中心
    expect(new Set(dists.map((d) => d.toFixed(1))).size).toBeGreaterThan(50); // 散布
    // 向心（高斯）：多数落点集中在内圈 —— P(r < rMax/2) > 35%
    const inside = dists.filter((d) => d < 3.5).length / dists.length;
    expect(inside).toBeGreaterThan(0.35);
    // 且有散布到外圈的样本（非全部贴中心）
    expect(dists.some((d) => d > 5.5)).toBe(true);
  });
});

describe("Fitts 时序", () => {
  it("时长随难度指数增长且带扰动", () => {
    const rng = defaultRng();
    const f = new FittsTimer({ a: 100, b: 180, w: 24 });
    const near = f.estimateMs(100, 24, rng);
    const far = f.estimateMs(1000, 24, rng);
    expect(far).toBeGreaterThan(near * 1.5);
    const t1 = f.estimateMs(500, 24, rng);
    const t2 = f.estimateMs(500, 24, rng);
    expect(t1).not.toBe(t2); // 扰动（分布而非常量）
  });
});

describe("区间采样器", () => {
  it("区间采样在界内且非恒定；中值为精确模式", () => {
    const s = new IntervalSampler(defaultRng());
    const vals = new Set<number>();
    for (let i = 0; i < 50; i++) vals.add(s.sample(300, 800));
    expect(vals.size).toBeGreaterThan(10);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(300);
      expect(v).toBeLessThanOrEqual(800);
    }
    expect(IntervalSampler.midpoint({ min: 300, max: 800 })).toBe(550);
    expect(IntervalSampler.midpoint(500)).toBe(500);
  });
});

function round3(steps: MoveStep[]): MoveStep[] {
  return steps.map((s) => ({
    dt: s.dt,
    dx: Math.round(s.dx * 1000) / 1000,
    dy: Math.round(s.dy * 1000) / 1000,
  }));
}
