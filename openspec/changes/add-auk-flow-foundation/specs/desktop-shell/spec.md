## ADDED Requirements

### Requirement: 脚本编辑与运行控制
`desktop-shell` SHALL 提供脚本编辑器（AHK 源码 + 注释指令高亮）、加载脚本、启动/停止回放、humanize 开关的运行时切换。

#### Scenario: 运行控制
- **WHEN** 用户在面板点击启动
- **THEN** 脚本经解析→IR→拟人化→引擎执行，面板显示运行状态；点击停止后输入注入 SHALL 在 100ms 内停止

### Requirement: 监控面板
`desktop-shell` SHALL 提供：截屏 + 检测框叠加（bbox + 置信度，阈值调节实时生效）、状态机/循环当前节点实时高亮（滞留超阈值标黄）、分级日志流。

#### Scenario: 检测框叠加
- **WHEN** 引擎上报 `frame` 消息含锚点命中框
- **THEN** 面板在截屏画布上绘制 bbox 与置信度；调整阈值滑块后下一帧按新阈值过滤

#### Scenario: 滞留标黄
- **WHEN** 当前执行节点滞留超过用户设定秒数
- **THEN** 面板将该节点标黄并记录 `state(reason=stuck)` 日志

### Requirement: UI 技术闸门
`desktop-shell` 的 UI SHALL 以 RN 原语（View/Text/Pressable）编写经 react-native-web 渲染于 Tauri webview。若 RNW+Tauri 链路在 2 周时间盒内未能打通（Metro/打包/invoke 任一环节），`ui` 包 SHALL 降级为普通 React DOM 实现，且降级 SHALL 仅影响 shell 包。

#### Scenario: 闸门验证通过
- **WHEN** RNW 构建的壳在 Tauri 中完成 invoke 调用与事件订阅的端到端演示
- **THEN** 闸门通过，UI 层固定为 RNW 路线

#### Scenario: 闸门降级
- **WHEN** 时间盒到期且链路未打通
- **THEN** 记录决策文档，`ui` 包切换 React DOM 目标，其余包不受影响
