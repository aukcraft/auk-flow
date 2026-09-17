/**
 * 意图 IR —— 与语法无关的动作原语集（spec intent-ir）。
 * IR 不包含任何轨迹/贝塞尔/抖动等物理细节；数值可为区间。
 */

export type Interval = { min: number; max: number };

/** L1 脚本层目标：锚定引用优先，屏幕绝对坐标仅兜底 */
export type Target =
  | { kind: "anchor"; name: string }
  | { kind: "window"; xPct: number; yPct: number }
  | { kind: "point"; x: number; y: number };

export type IrPrimitive =
  | { op: "move"; target: Target }
  | { op: "click"; target: Target; double?: boolean; button?: "left" | "right" | "middle" }
  | { op: "drag"; from: Target; to: Target }
  | { op: "press"; keys: string[] } // 组合键序列（combo 资产展开后）
  | { op: "type"; text: string; interKeyMs?: Interval }
  | { op: "scroll"; target: Target; delta: number }
  | { op: "hover"; target: Target }
  | { op: "wait"; ms: number | Interval };

export interface IrInstruction {
  prim: IrPrimitive;
  line: number; // 溯源到 AHK 行号
}

/** 控制流：线性化 + 相对跳转（Loop/While/If → 块结构线性化产物） */
export interface IrProgram {
  instructions: IrInstruction[];
  /** 组合键资产（意图与操作分离：上层只发意图名） */
  combos: Record<string, { key: string; press: number; release: number }[]>;
}

/** 拟人化配置（由 auk 指令与引擎全局配置合并） */
export interface HumanizeConfig {
  on: boolean;
  profile?: { age?: string; style?: string };
}
