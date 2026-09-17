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
