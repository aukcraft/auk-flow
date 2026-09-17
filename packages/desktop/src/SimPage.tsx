/**
 * 模拟页：手动点击（或随机模式自动出点）→ 鼠标指针按拟人轨迹移动。
 * - 指针动画（真实 dt 时序回放）
 * - 速度剖面 v(t) 实时绘制（加速-峰值-减速两阶段）
 * 修复：canvas 位图尺寸跟随显示尺寸（ResizeObserver），否则位图停留在
 * 默认 300×150，所有绘制被裁剪 → "点击没反应"。
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { speedProfile, windmouse, type Step } from "./windmouse.ts";

interface Props {
  kernel: "windmouse" | "model";
  modelSteps: Step[] | null;
}

/** host 通道：插件页面可通过 postMessage 请求 host 能力（V1 最小面） */
export const HOST_BRIDGE = {
  saveCorpus: (name: string, jsonl: string) => hostInvoke("save_corpus_file", { name, content: jsonl }),
};

async function hostInvoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(cmd, args);
  } catch {
    console.warn("host invoke 不可用（浏览器预览）", cmd);
    return null;
  }
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
  const randomModeRef = useRef(randomMode);
  randomModeRef.current = randomMode;

  const fitCanvas = useCallback((cv: HTMLCanvasElement) => {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }, []);

  // 尺寸跟踪（窗口缩放时位图同步）
  useEffect(() => {
    const cv = canvasRef.current;
    const ch = chartRef.current;
    if (!cv || !ch) return;
    const ro = new ResizeObserver(() => {
      fitCanvas(cv);
      fitCanvas(ch);
    });
    ro.observe(cv);
    ro.observe(ch);
    fitCanvas(cv);
    fitCanvas(ch);
    return () => ro.disconnect();
  }, [fitCanvas]);

  const buildTrajectory = useCallback(
    (to: { x: number; y: number }): Step[] => {
      if (kernel === "model" && modelSteps && modelSteps.length > 3) {
        return warpTo(posRef.current, to, modelSteps);
      }
      return windmouse(posRef.current, to);
    },
    [kernel, modelSteps],
  );

  const fireRandom = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    animate(buildTrajectory({ x: 40 + Math.random() * (r.width - 80), y: 40 + Math.random() * (r.height - 80) }));
  }, [buildTrajectory]);

  const animate = useCallback((steps: Step[]) => {
    cancelAnimationFrame(rafRef.current);
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const chart = chartRef.current?.getContext("2d");
    const prof = speedProfile(steps);
    const totalMs = steps.reduce((s, x) => s + x.dt, 0) || 1;
    const dist = Math.hypot(steps.at(-1)!.x - steps[0]!.x, steps.at(-1)!.y - steps[0]!.y);
    const peak = prof.length ? Math.max(...prof.map((p) => p.v)) : 0;
    setLastStats({ dur: Math.round(totalMs), dist: Math.round(dist), peak: Math.round(peak * 1000) });
    const t0 = performance.now();

    const tick = (now: number) => {
      const el = now - t0;
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < steps.length; i++) {
        acc += steps[i]!.dt;
        if (acc > el) break;
        idx = i;
      }
      const cur = steps[idx]!;
      trailRef.current.push({ x: cur.x, y: cur.y });
      const r = cv.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      // 轨迹尾迹
      ctx.strokeStyle = "rgba(88,166,255,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      trailRef.current.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      // 目标点
      const end = steps.at(-1)!;
      ctx.strokeStyle = "#d29922";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 8, 0, 7);
      ctx.stroke();
      // 鼠标指针（真实箭头形状）
      ctx.save();
      ctx.translate(cur.x, cur.y);
      ctx.fillStyle = "#e6edf3";
      ctx.strokeStyle = "#0d1117";
      ctx.lineWidth = 0.8;
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
      ctx.stroke();
      ctx.restore();
      // 速度剖面
      if (chart && chartRef.current) {
        const cr = chartRef.current.getBoundingClientRect();
        chart.clearRect(0, 0, cr.width, cr.height);
        chart.fillStyle = "#161b22";
        chart.fillRect(0, 0, cr.width, cr.height);
        const maxV = Math.max(peak, 1e-6);
        chart.strokeStyle = "#d29922";
        chart.lineWidth = 1.5;
        chart.beginPath();
        prof.forEach((p, i) => {
          const px = (p.t / totalMs) * cr.width;
          const py = cr.height - (p.v / maxV) * (cr.height - 12) - 6;
          i ? chart.lineTo(px, py) : chart.moveTo(px, py);
        });
        chart.stroke();
      }
      if (el < totalMs) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        posRef.current = { x: end.x, y: end.y };
        setStatus(`完成：${Math.round(totalMs)}ms · ${Math.round(dist)}px · 峰值 ${Math.round(peak * 1000)}px/s`);
        if (randomModeRef.current) {
          setTimeout(() => fireRandom(), 300 + Math.random() * 700);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [fireRandom]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (randomMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    trailRef.current = [];
    animate(buildTrajectory({ x: e.clientX - r.left, y: e.clientY - r.top }));
  };

  useEffect(() => {
    if (randomMode) fireRandom();
    return () => cancelAnimationFrame(rafRef.current);
  }, [randomMode, fireRandom]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "8px 14px", display: "flex", gap: 14, alignItems: "center", borderBottom: "1px solid #30363d", fontSize: 13 }}>
        <label>
          <input type="checkbox" checked={randomMode} onChange={(e) => setRandomMode(e.target.checked)} /> 随机点位自动循环
        </label>
        <span style={{ color: "#8b949e" }}>{status}</span>
      </div>
      <canvas
        ref={canvasRef}
        onClick={onClick}
        style={{ flex: 1, minHeight: 120, background: "#0d1117", cursor: randomMode ? "default" : "crosshair", display: "block", width: "100%" }}
      />
      <div style={{ padding: "6px 14px 10px" }}>
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
          速度剖面 v(t)
          {lastStats && ` · 时长 ${lastStats.dur}ms · 距离 ${lastStats.dist}px · 峰值 ${lastStats.peak}px/s · 内核 ${kernel === "model" ? "模型轨迹" : "WindMouse"}`}
        </div>
        <canvas ref={chartRef} style={{ width: "100%", height: 90, borderRadius: 6, display: "block" }} />
      </div>
    </div>
  );
}

/** 把模型生成的增量序列缩放/旋转/平移到 (from → to)。 */
function warpTo(from: { x: number; y: number }, to: { x: number; y: number }, steps: Step[]): Step[] {
  const sx = steps.at(-1)!.x - steps[0]!.x;
  const sy = steps.at(-1)!.y - steps[0]!.y;
  const scale = Math.hypot(to.x - from.x, to.y - from.y) / Math.max(Math.hypot(sx, sy), 1e-6);
  const ang = Math.atan2(to.y - from.y, to.x - from.x) - Math.atan2(sy, sx);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return steps.map((s) => {
    const dx = (s.x - steps[0]!.x) * scale;
    const dy = (s.y - steps[0]!.y) * scale;
    return { dt: s.dt, x: from.x + dx * cos - dy * sin, y: from.y + dx * sin + dy * cos };
  });
}
