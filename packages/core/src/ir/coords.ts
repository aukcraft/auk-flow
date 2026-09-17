/**
 * 三层坐标（spec intent-ir）：
 * L1 脚本层（Target）→ L2 引擎层（物理像素）→ L3 模型层（归一化空间）。
 *
 * - L2：DPI 缩放换算、多显示器单屏归一、小数像素误差累积舍入
 * - L3：方向 (cosθ,sinθ)、log₂ 距离、往返变换误差 ≤1 物理像素
 * - 拟人化只发生在 L3，反变换回 L2 保持比例缩放
 */

export interface PhysicalPoint {
  x: number; // 物理像素
  y: number;
}

export interface ScreenTransform {
  /** 显示缩放（1.0 = 100%）；L1 逻辑像素 → L2 物理 */
  scaleFactor: number;
  /** 目标窗口在虚拟屏幕上的物理原点（多显归一基准） */
  originX: number;
  originY: number;
  /** 窗口物理宽高（百分比目标换算用） */
  width: number;
  height: number;
}

export const DEFAULT_TRANSFORM: ScreenTransform = {
  scaleFactor: 1,
  originX: 0,
  originY: 0,
  width: 1920,
  height: 1080,
};

/** L1（窗口百分比）→ L2 物理像素 */
export function windowPctToPhysical(
  xPct: number,
  yPct: number,
  t: ScreenTransform,
): PhysicalPoint {
  return {
    x: t.originX + (xPct / 100) * t.width,
    y: t.originY + (yPct / 100) * t.height,
  };
}

/** L1（逻辑像素）→ L2 物理像素（DPI 换算） */
export function logicalToPhysical(x: number, y: number, t: ScreenTransform): PhysicalPoint {
  return { x: x * t.scaleFactor, y: y * t.scaleFactor };
}

// ---------- L3 归一化空间 ----------

/** L3 模型层条件（分辨率无关；不用绝对像素与裸角度） */
export interface NormalizedMove {
  cosTheta: number;
  sinTheta: number;
  log2Distance: number;
}

export function toNormalized(from: PhysicalPoint, to: PhysicalPoint): NormalizedMove {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return { cosTheta: 1, sinTheta: 0, log2Distance: 0 };
  return {
    cosTheta: dx / dist,
    sinTheta: dy / dist,
    log2Distance: Math.log2(Math.max(dist, 1)),
  };
}

/** L3 → L2 反变换：给定起点与归一化条件恢复终点（误差 ≤1px，spec 场景） */
export function fromNormalized(from: PhysicalPoint, n: NormalizedMove): PhysicalPoint {
  const dist = Math.pow(2, n.log2Distance);
  return { x: from.x + n.cosTheta * dist, y: from.y + n.sinTheta * dist };
}

/**
 * 小数像素误差累积舍入器（spec：避免轨迹系统性偏移）。
 * 每次舍入把小数部分滚存到下一事件。
 */
export class ErrorAccumulatingRounder {
  private carryX = 0;
  private carryY = 0;

  round(x: number, y: number): { x: number; y: number } {
    this.carryX += x;
    this.carryY += y;
    const rx = Math.round(this.carryX);
    const ry = Math.round(this.carryY);
    this.carryX -= rx;
    this.carryY -= ry;
    return { x: rx, y: ry };
  }

  /** 累计绝对偏差（诊断用） */
  get carry(): PhysicalPoint {
    return { x: this.carryX, y: this.carryY };
  }
}
