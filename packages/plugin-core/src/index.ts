/**
 * @auk-flow/plugin-core —— auk-plugin-spec 的 PC 宿主边界（spec 概念 3.5）。
 *
 * 五要素：manifest / schema（参数声明 → 自动生成 UI）/ lifecycle / events / host API。
 * skills 即插件；auk-flow 通过此层暴露 engine 能力给 UI。
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** 参数声明 → 自动生成配置 UI */
  params: ParamDecl[];
}

export interface ParamDecl {
  key: string;
  type: "string" | "number" | "boolean" | "interval";
  label?: string;
  default?: unknown;
}

export type PluginEvent =
  | { kind: "lifecycle"; phase: "load" | "start" | "stop" | "unload" }
  | { kind: "log"; level: "debug" | "info" | "warn" | "error"; msg: string };

/** host API：engine 能力的类型化投影（V1 最小面） */
export interface HostApi {
  runScript(source: string): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: PanelMessageLike) => void): () => void;
}

/** 与 auk-motion events::PanelMessage 对应的 TS 侧类型 */
export type PanelMessageLike =
  | { kind: "frame"; seq: number; boxes: { x: number; y: number; w: number; h: number; confidence: number }[] }
  | { kind: "state"; from: string; to: string; reason: string; ts: number }
  | { kind: "log"; level: string; msg: string };

/** 权限白名单（与 desktop src-tauri ALLOWED_PERMISSIONS 同源，改动须双侧同步） */
export const PERMISSION_WHITELIST = ["panel.log", "panel.state", "sim.trajectory.read"] as const;

export type Permission = (typeof PERMISSION_WHITELIST)[number];

export interface LoadedManifest extends PluginManifest {
  entry?: string;
  permissions?: string[];
}

/** 清单校验：字段完整性 + id 格式 + 权限白名单。返回错误列表（空 = 通过）。 */
export function validateManifest(m: unknown): string[] {
  const errs: string[] = [];
  const v = m as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return ["manifest 必须是对象"];
  if (typeof v["id"] !== "string" || !/^[a-z0-9-]{2,40}$/.test(v["id"])) errs.push("id 须为 2-40 位小写字母/数字/连字符");
  if (typeof v["name"] !== "string" || v["name"].length === 0) errs.push("name 不能为空");
  if (typeof v["version"] !== "string" || !/^\d+\.\d+\.\d+/.test(v["version"])) errs.push("version 须为 semver");
  if (!Array.isArray(v["params"])) errs.push("params 必须是数组（可为空）");
  if (Array.isArray(v["permissions"])) {
    for (const p of v["permissions"]) {
      if (typeof p !== "string" || !(PERMISSION_WHITELIST as readonly string[]).includes(p)) {
        errs.push(`权限超出白名单: ${String(p)}`);
      }
    }
  }
  return errs;
}
