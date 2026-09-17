import { useRef, useState } from "react";
import { SimPage } from "./SimPage.tsx";
import { DataPage } from "./DataPage.tsx";
import { PluginPage } from "./PluginPage.tsx";
import type { Step } from "./windmouse.ts";

type Tab = "sim" | "range" | "data" | "plugins";

const TABS: { id: Tab; label: string }[] = [
  { id: "sim", label: "模拟" },
  { id: "range", label: "靶场采集" },
  { id: "data", label: "数据 · 训练" },
  { id: "plugins", label: "插件" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("sim");
  const [kernel, setKernel] = useState<"windmouse" | "model">("windmouse");
  const [modelSteps, setModelSteps] = useState<Step[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadModelJson = (file: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const trajs = JSON.parse(String(rd.result)) as {
          source: string;
          points: [number, number, number][];
        }[];
        const gen = trajs.find((t) => t.source !== "ref" && t.points.length > 3);
        if (gen) {
          // [t,x,y] → Step（dt 从时间差计算）
          const steps: Step[] = gen.points.map((p, i) => ({
            dt: i === 0 ? 0 : Math.max(p[0] - gen.points[i - 1]![0], 1),
            x: p[1],
            y: p[2],
          }));
          setModelSteps(steps);
          setKernel("model");
          setTab("sim");
        }
      } catch {
        alert("JSON 解析失败");
      }
    };
    rd.readAsText(file);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "#0d1117", color: "#e6edf3", fontFamily: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      {/* 侧栏 */}
      <nav style={{ width: 180, flexShrink: 0, borderRight: "1px solid #30363d", padding: "14px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 16px 14px", fontWeight: 700, fontSize: 16 }}>
          AukFlow <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 400 }}>v0.1</span>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              textAlign: "left", padding: "9px 16px", background: tab === t.id ? "#161b22" : "transparent",
              border: "none", borderLeft: tab === t.id ? "3px solid #58a6ff" : "3px solid transparent",
              color: tab === t.id ? "#e6edf3" : "#8b949e", cursor: "pointer", fontSize: 14,
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "0 16px", fontSize: 11, color: "#8b949e" }}>
          拟人内核: {kernel === "model" ? "模型轨迹" : "WindMouse"}
        </div>
      </nav>
      {/* 内容 */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {tab === "sim" && (
          <>
            <div style={{ padding: "8px 14px 0", fontSize: 13, display: "flex", gap: 12, alignItems: "center" }}>
              <label>
                内核:
                <select
                  value={kernel}
                  onChange={(e) => setKernel(e.target.value as "windmouse" | "model")}
                  style={{ marginLeft: 6, background: "#161b22", color: "#e6edf3", border: "1px solid #30363d", borderRadius: 4, padding: "2px 6px" }}
                >
                  <option value="windmouse">WindMouse（规则）</option>
                  <option value="model" disabled={!modelSteps}>模型轨迹（需先载入 JSON）</option>
                </select>
              </label>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ background: "#21262d", color: "#e6edf3", border: "1px solid #30363d", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
              >
                载入模型轨迹 JSON
              </button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && loadModelJson(e.target.files[0])} />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <SimPage kernel={kernel} modelSteps={modelSteps} />
            </div>
          </>
        )}
        {tab === "range" && (
          <iframe src="range/index.html" title="range" style={{ flex: 1, border: "none", background: "#111" }} />
        )}
        {tab === "data" && <DataPage />}
        {tab === "plugins" && <PluginPage />}
      </main>
    </div>
  );
}
