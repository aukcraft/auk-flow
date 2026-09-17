/**
 * 拟人化编译 pass（spec humanize-pass）。
 * 接口冻结：`(起点, 终点, 上下文, profile) → [(dt, dx, dy)...]`
 * 内核可替换：V1 规则（WindMouse+Fitts）/ V2 参数拟合 / V3 模型。
 */

import { FittsTimer, WindMouseKernel } from "./windmouse.ts";
import { IntervalSampler, LandingDistribution } from "./sampler.ts";

export interface MoveRequest {
  from: { x: number; y: number }; // L2 物理像素
  to: { x: number; y: number };
  /** 目标宽度（像素）—— Fitts 定律与终点兜底用；缺省 24 */
  targetWidthPx?: number;
}

export interface MoveContext {
  /** 前序段落的终速（px/ms）与方向 —— 连点段间停顿建模（预留） */
  prevEndSpeed?: number;
  prevDir?: { cos: number; sin: number };
}

export interface HumanizeProfile {
  age?: string;
  style?: string;
  /** 采样温度（风格漂移调节，spec: 稳定像 A 反而是固定指纹） */
  temperature?: number;
}

/** 输出增量：dt 相对毫秒、dx/dy 位移（模型/规则内核统一格式） */
export interface MoveStep {
  dt: number;
  dx: number;
  dy: number;
}

export interface HumanizeKernel {
  readonly id: string;
  generate(req: MoveRequest, ctx?: MoveContext, profile?: HumanizeProfile): Promise<MoveStep[]>;
}

// ---------- 内核注册 ----------

const registry = new Map<string, HumanizeKernel>();

export function registerKernel(kernel: HumanizeKernel): void {
  registry.set(kernel.id, kernel);
}
export function getKernel(id: string): HumanizeKernel {
  const k = registry.get(id);
  if (!k) throw new Error(`humanize kernel "${id}" not registered`);
  return k;
}

export function defaultRng(): () => number {
  // xorshift32* —— 确定性可播种（回归测试用固定种子）
  let s = 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5; s >>>= 0;
    return ((s * 0x2545f491) >>> 8) / 0x1000000;
  };
}

/** V1 默认内核：WindMouse + Fitts（注册 id: "windmouse"） */
export function createDefaultKernel(rng: () => number = defaultRng()): HumanizeKernel {
  return new WindMouseKernel(
    new FittsTimer({ a: 100, b: 180, w: 24 }),
    new IntervalSampler(rng),
    new LandingDistribution(rng),
    rng,
  );
}

export { FittsTimer, WindMouseKernel, preciseMove } from "./windmouse.ts";
export type { PreciseMove } from "./windmouse.ts";
export { IntervalSampler, LandingDistribution } from "./sampler.ts";
