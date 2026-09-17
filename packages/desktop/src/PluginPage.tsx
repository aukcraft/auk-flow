/** 插件页：列出插件目录的 manifest（plugin-core 协议），显示加载状态与贡献页签。 */

import { useEffect, useState } from "react";

interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description: string | null;
  tab: { label: string; entry: string } | null;
}

async function invoke<T>(cmd: string): Promise<T | null> {
  try {
    const core = await import("@tauri-apps/api/core");
    return await core.invoke<T>(cmd);
  } catch {
    return null;
  }
}

export function PluginPage() {
  const [plugins, setPlugins] = useState<PluginMeta[] | null>(null);

  useEffect(() => {
    invoke<PluginMeta[]>("list_plugins").then((list) => setPlugins(list ?? []));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>插件</h2>
      {plugins === null ? (
        <span style={{ color: "#8b949e" }}>加载中…（浏览器预览模式下 Rust 后端不可用）</span>
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
