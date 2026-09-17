/**
 * WindMouse 轨迹生成（packages/core humanize/windmouse.ts 的 JS 移植）。
 * 模拟页用：手动点击/随机目标 → 指针按拟人轨迹移动 + 速度剖面。
 */

export interface Step {
  dt: number;
  x: number;
  y: number;
}

/** 生成 (from → to) 的拟人轨迹（px/ms 时序）。 */
export function windmouse(
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { gravity?: number; wind?: number; maxStep?: number; rng?: () => number } = {},
): Step[] {
  const { gravity = 9, wind = 3, maxStep = 10, rng = Math.random } = opts;
  let { x, y } = from;
  let vx = 0;
  let vy = 0;
  let t = 0;
  const steps: Step[] = [{ dt: 0, x, y }];
  let guard = 0;
  for (;;) {
    if (++guard > 2000) break;
    const remX = to.x - x;
    const remY = to.y - y;
    const rem = Math.hypot(remX, remY);
    if (rem < 0.6) break;
    const w = Math.min(1, rem / 160);
    vx += (rng() * 2 - 1) * wind * w;
    vy += (rng() * 2 - 1) * wind * w;
    vx = vx * 0.72 + (remX / rem) * gravity * w;
    vy = vy * 0.72 + (remY / rem) * gravity * w;
    let dx = vx;
    let dy = vy;
    const len = Math.hypot(dx, dy);
    if (len > maxStep) {
      dx = (dx / len) * maxStep;
      dy = (dy / len) * maxStep;
    }
    if (rem < 12) {
      dx = remX * 0.35;
      dy = remY * 0.35;
    }
    const dt = Math.max(3, 8 * (0.8 + rng() * 0.4));
    x += dx;
    y += dy;
    t += dt;
    steps.push({ dt, x, y });
  }
  // 点击前犹豫（80~300ms 原地）
  steps.push({ dt: 80 + rng() * 220, x, y });
  return steps;
}

/** 速度剖面 v(t)（px/ms → px/s 展示）。 */
export function speedProfile(steps: Step[]): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  let t = 0;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1]!;
    const b = steps[i]!;
    t += b.dt;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    out.push({ t, v: d / Math.max(b.dt, 0.001) });
  }
  return out;
}
