// plugin-core v1：入口接收 host api（PanelMessage 通道）
export function activate(host) {
  host.panel.log("demo-logger 已激活");
}
