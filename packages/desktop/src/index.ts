/**
 * @auk-flow/desktop —— Tauri 2.x 壳（骨架）。
 *
 * 任务 6.1-6.2（Tauri 壳 + RNW 闸门）为构建期工作：本沙箱无 Windows/
 * Tauri 运行环境，此处仅声明壳的入口契约。RNW+Tauri 链路验证（Metro/打包/
 * invoke）按 design D6 设 2 周时间盒，不通则 ui 包降级 React DOM。
 */

export const SHELL_BRIDGE = {
  invokeRun: "auk_run_script",
  invokeStop: "auk_stop",
  eventFrame: "auk://frame",
  eventState: "auk://state",
  eventLog: "auk://log",
} as const;
