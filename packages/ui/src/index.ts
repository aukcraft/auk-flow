/**
 * @auk-flow/ui —— RN 原语组件层（spec desktop-shell: UI 技术闸门）。
 *
 * 第一天用 RN 原语（View/Text/Pressable）编写，经 react-native-web 渲染于
 * Tauri webview；闸门降级时仅此包切换 target 到 React DOM。
 * 当前为占位骨架：RNW 依赖在闸门验证（任务 6.2）时引入。
 */

export interface PanelProps {
  title: string;
}

export function panelId(props: PanelProps): string {
  return `auk-panel:${props.title}`;
}
