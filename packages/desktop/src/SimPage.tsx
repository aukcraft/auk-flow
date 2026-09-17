/**
 * 模拟页：手动点击（或随机模式自动出点）→ 鼠标指针按拟人轨迹移动。
 * - 指针动画（真实 dt 时序回放）
 * - 速度剖面 v(t) 实时绘制（动态展示速度模式：加速-峰值-减速两阶段）
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { speedProfile, windmouse, type Step } from "./windmouse.ts";

interface Props {
  kernel: "windmouse" | "model";
  modelSteps: Step[] | null; // 模型轨迹（外部喂入，重放模式）
}

export function SimPage({ kernel, modelSteps }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const posRef = useRef({ x: 200, y: 200 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const rafRef = useRef(0);
  const [randomMode, setRandomMode] = useState(false);
  const [status, setStatus] = useState("点击画布任意位置 → 指针拟人移动");
  const [lastStats, setLastStats] = useState<{ dur: number; dist: number; peak: number } | null>(null);

  const buildTrajectory = useCallback(
    (to: { x: number; y: number }): Step[] => {
      if (kernel === "model" && modelSteps && modelSteps.length > 3) {
        // 模型模式：把归一化增量序列平移缩放到当前 → 目标
        return warpTo(posRef.current, to, modelSteps);
      }
      return windmouse(posRef.current, to);
    },
    [kernel, modelSteps],
  );

  const animate = useCallback((steps: Step[]) => {
    cancelAnimationFrame(rafRef.current);
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const chart = chartRef.current?.getContext("2d");
    const prof = speedProfile(steps);
    const totalMs = steps.reduce((s, x) => s + x.dt, 0);
    const t0 = performance.now();
    const dist = Math.hypot(steps.at(-1)!.x - steps[0]!.x, steps.at(-1)!.y - steps[0]!.y);
    const peak = prof.length ? Math.max(...prof.map((p) => p.v)) : 0;
    setLastStats({ dur: Math.round(totalMs), dist: Math.round(dist), peak: Math.round(peak * 1000) });

    const tick = (now: number) => {
      const el = now - t0;
      // 轨迹索引
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < steps.length; i++) {
        acc += steps[i]!.dt;
        if (acc > el) break;
        idx = i;
      }
      const cur = steps[idx]!;
      trailRef.current.push({ x: cur.x, y: cur.y });
      // 画布
      const r = cv.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      // trail
      ctx.strokeStyle = "rgba(88,166,255,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      trailRef.current.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // 指针
      ctx.save();
      ctx.translate(cur.x, cur.y);
      ctx.fillStyle = "#e6edf3";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 16);
      ctx.lineTo(4.5, 12);
      ctx.lineTo(7.5, 17.5);
      ctx.lineTo(10.5, 16);
      ctx.lineTo(7.4, 10.6);
      ctx.lineTo(12, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#0d1117";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      // 速度剖面
      if (chart) {
        const cr = chartRef.current!.getBoundingClientRect();
        chart.clearRect(0, 0, cr.width, cr.height);
        chart.fillStyle = "#161b22";
        chart.fillRect(0, 0, cr.width, cr.height);
        const maxV = Math.max(peak, 1e-6);
        chart.strokeStyle = "#d29922";
        chart.lineWidth = 1.5;
        chart.beginPath();
        prof.forEach((p, i) => {
          const px = (p.t / Math.max(totalMs, 1)) * cr.width;
          const py = cr.height - (p.v / maxV) * (cr.height - 12) - 6;
          i ? chart.lineTo(px, py) : chart.moveTo(px, py);
        });
        chart.stroke();
      }
      if (el < totalMs) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        posRef.current = { x: steps.at(-1)!.x, y: steps.at(-1)!.y };
        setStatus(`完成：${Math.round(totalMs)}ms · ${Math.round(dist)}px · 峰值 ${Math.round(peak * 1000)}px/s`);
        if (randomModeRef.current) {
          setTimeout(() => fireRandom(), 300 + Math.random() * 700);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const randomModeRef = useRef(randomMode);
  randomModeRef.current = randomMode;

  const fireRandom = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    animate(buildTrajectory({ x: 40 + Math.random() * (r.width - 80), y: 40 + Math.random() * (r.height - 80) }));
  }, [animate, buildTrajectory]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (randomMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    const to = { x: e.clientX - r.left, y: e.clientY - r.top };
    trailRef.current = [];
    animate(buildTrajectory(to));
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "8px 14px", display: "flex", gap: 14, alignItems: "center", borderBottom: "1px solid #30363d", fontSize: 13 }}>
        <label>
          <input type="checkbox" checked={randomMode} onChange={(e) => setRandomMode(e.target.checked)} /> 随机点位自动循环
        </label>
        {randomMode && !lastStats && <span style={{ color: "#8b949e" }}>启动中…</span>}
        <span style={{ color: "#8b949e" }}>{status}</span>
        {lastStats && (
          <span style={{ marginLeft: "auto", color: "#8b949e" }}>
            内核 <b style={{ color: "#58a6ff" }}>{kernel === "model" ? "模型轨迹" : "WindMouse"}</b>
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onClick={onClick}
        style={{ flex: 1, background: "#0d1117", cursor: randomMode ? "default" : "crosshair" }}
      />
      <div style={{ padding: "6px 14px 10px" }}>
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
          速度剖面 v(t) {lastStats && `· 时长 ${lastStats.dur}ms · 距离 ${lastStats.dist}px · 峰值 ${lastStats.peak}px/s`}
        </div>
        <canvas ref={chartRef} style={{ width: "100%", height: 90, borderRadius: 6, display: "block" }} />
      </div>
    </div>
  );
}

/** 把模型生成的增量序列缩放/旋转/平移到 (from → to)。 */
function warpTo(from: { x: number; y: number }, to: { x: number; y: number }, steps: Step[]): Step[] {
  const scale = Math.hypot(to.x - from.x, to.y - from.y) /
    Math.max(Math.hypot(steps.at(-1)!.x - steps[0]!.x, steps.at(-1)!.y - steps[0]!.y), 1e-6);
  const ang = Math.atan2(to.y - from.y, to.x - from.x) -
    Math.atan2(steps.at(-1)!.y - steps[0]!.y, steps.at(-1)!.x - steps[0]!.x);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return steps.map((s) => {
    const dx = (s.x - steps[0]!.x) * scale;
    const dy = (s.y - steps[0]!.y) * scale;
    return { dt: s.dt, x: from.x + dx * cos - dy * sin, y: from.y + dx * sin + dy * cos };
  });
}
