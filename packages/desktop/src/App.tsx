import { useCallback, useEffect, useRef, useState } from "react";
import { SimPage } from "./SimPage.tsx";
import { PluginPage } from "./PluginPage.tsx";
import type { Step } from "./windmouse.ts";

interface PluginTab {
  id: string;
  name: string;
  label: string;
  entry: string;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const core = await import("@tauri-apps/api/core");
    return await core.invoke<T>(cmd, args);
  } catch {
    return null; // 浏览器预览 / 后端不可用
  }
}

/** 插件页签：srcDoc 渲染 + 宿主桥（postMessage ↔ 白名单命令） */
function PluginTab({
  plugin,
  onSimLoad,
}: {
  plugin: PluginTab;
  onSimLoad: (steps: Step[]) => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<string>("read_plugin_page", { id: plugin.id }).then((h) => {
      if (alive) setHtml(h ?? `<body style="background:#0d1117;color:#8b949e;font:14px system-ui;padding:20px">插件 "${plugin.id}" 页面不可用（需要桌面端运行）</body>`);
    });
    return () => {
      alive = false;
    };
  }, [plugin.id]);

  // 宿主桥：插件页唯一的能力出口
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown> | null;
      if (!msg || typeof msg["type"] !== "string") return;
      const type = msg["type"] as string;
      if (type === "auk:save-corpus") {
        const path = await invoke<string>("save_corpus_file", {
          name: String(msg["name"] ?? "corpus.jsonl"),
          content: String(msg["content"] ?? ""),
        });
        e.source?.postMessage({ type: "auk:saved", path }, { targetOrigin: "*" });
      } else if (type === "auk:sim-load") {
        const steps = msg["steps"] as Step[] | undefined;
        if (Array.isArray(steps) && steps.length > 3) onSimLoad(steps);
      }
    };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
  }, [onSimLoad]);

  return (
    <iframe
      ref={iframeRef}
      title={plugin.id}
      srcDoc={html ?? "<body></body>"}
      style={{ flex: 1, border: "none", background: "#0d1117" }}
    />
  );
}

export function App() {
  const [plugins, setPlugins] = useState<PluginTab[]>([]);
  const [pluginError, setPluginError] = useState("");
  const [tab, setTab] = useState<string>("sim");
  const [kernel, setKernel] = useState<"windmouse" | "model">("windmouse");
  const [modelSteps, setModelSteps] = useState<Step[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    invoke<({ id: string; name: string; tab: { label: string; entry: string } | null })[]>(
      "list_plugins",
    ).then((list) => {
      if (!list) {
        setPluginError("Rust 后端未连接（浏览器预览模式）");
        return;
      }
      setPlugins(
        list
          .filter((p) => p.tab)
          .map((p) => ({ id: p.id, name: p.name, label: p.tab!.label, entry: p.tab!.entry })),
      );
    });
  }, []);

  const onSimLoad = useCallback((steps: Step[]) => {
    setModelSteps(steps);
    setKernel("model");
    setTab("sim");
  }, []);

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
          const steps: Step[] = gen.points.map((p, i) => ({
            dt: i === 0 ? 0 : Math.max(p[0] - gen.points[i - 1]![0], 1),
            x: p[1],
            y: p[2],
          }));
          onSimLoad(steps);
        }
      } catch {
        alert("JSON 解析失败");
      }
    };
    rd.readAsText(file);
  };

  const tabs: { id: string; label: string }[] = [
    { id: "sim", label: "模拟" },
    ...plugins.map((p) => ({ id: `plugin:${p.id}`, label: p.label })),
    { id: "plugins", label: "插件" },
  ];

  return (
    <div style={{ display: "flex", height: "100%", background: "#0d1117", color: "#e6edf3", fontFamily: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <nav style={{ width: 180, flexShrink: 0, borderRight: "1px solid #30363d", padding: "14px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 16px 14px", fontWeight: 700, fontSize: 16 }}>
          AukFlow <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 400 }}>v0.1</span>
        </div>
        {tabs.map((t) => (
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
          {pluginError && <div style={{ color: "#d29922", marginTop: 4 }}>{pluginError}</div>}
        </div>
      </nav>
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
                  <option value="model" disabled={!modelSteps}>模型轨迹（训练插件生成或载入 JSON）</option>
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
        {tab.startsWith("plugin:") &&
          (() => {
            const p = plugins.find((x) => `plugin:${x.id}` === tab);
            return p ? <PluginTab plugin={p} onSimLoad={onSimLoad} /> : null;
          })()}
        {tab === "plugins" && <PluginPage />}
      </main>
    </div>
  );
}
