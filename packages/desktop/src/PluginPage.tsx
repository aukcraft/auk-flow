/** 插件页：列出插件目录的 manifest（plugin-core 协议），显示加载状态。 */

import { useEffect, useState } from "react";

interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description?: string;
}

// Tauri invoke（web 预览时降级为 fetch）
async function invoke<T>(cmd: string): Promise<T> {
  // @ts-expect-error window.__TAURI_INTERNALS__ 仅在 Tauri webview 存在
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
    // @ts-expect-error 同上
    return window.__TAURI_INTERNALS__.invoke(cmd);
  }
  const r = await fetch(`http://localhost:61777/${cmd}`);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

export function PluginPage() {
  const [plugins, setPlugins] = useState<PluginMeta[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    invoke<PluginMeta[]>("list_plugins")
      .then(setPlugins)
      .catch((e: unknown) => {
        setPlugins([]);
        setErr(String(e));
      });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>插件</h2>
      {err && (
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 10 }}>
          Rust 后端未连接（浏览器预览模式）。插件清单放置于 <code>plugins/</code> 目录（auk-plugin.json）。
        </div>
      )}
      {plugins === null ? (
        <span style={{ color: "#8b949e" }}>加载中…</span>
      ) : plugins.length === 0 ? (
        <div style={{ color: "#8b949e", fontSize: 13 }}>
          未发现插件。示例：
          <pre style={{ background: "#161b22", padding: 12, borderRadius: 6, marginTop: 8, fontSize: 12 }}>
{`plugins/
  demo-logger/
    auk-plugin.json   ← manifest（id/name/version）
    main.js           ← 入口`}
          </pre>
        </div>
      ) : (
        plugins.map((p) => (
          <div key={p.id} style={{ border: "1px solid #30363d", borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div>
              <b>{p.name}</b> <span style={{ color: "#8b949e" }}>v{p.version}</span>
              <span style={{ marginLeft: 8, color: "#3fb950", fontSize: 12 }}>● 已加载</span>
            </div>
            {p.description && <div style={{ fontSize: 12, color: "#8b949e" }}>{p.description}</div>}
          </div>
        ))
      )}
    </div>
  );
}
