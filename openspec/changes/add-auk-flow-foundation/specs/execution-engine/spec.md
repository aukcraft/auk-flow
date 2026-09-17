## ADDED Requirements

### Requirement: 毫秒时序动作队列
`execution-engine` SHALL 维护按绝对时间戳调度的动作队列，将 humanize-pass 产出的增量序列按时序派发至输入注入层。相邻事件的派发偏差 SHALL 不超过 ±2ms（Windows 定时器分辨率约束下使用高精度等待）。

#### Scenario: 时序保真
- **WHEN** 动作流含间隔为 8ms 的连续 50 个 move 事件
- **THEN** 实际派发间隔与计划间隔的平均偏差不超过 2ms

### Requirement: 输入注入
`execution-engine` SHALL 通过用户态 API（Windows `SendInput` / enigo 跨平台后端）注入键鼠事件，SHALL NOT 实现或加载内核级驱动。SHALL 支持按下/释放/移动/滚轮四类事件。

#### Scenario: 组合时序
- **WHEN** 意图 IR 含 combo 资产 `[{key:"1",press:0,release:50},...]`
- **THEN** 注入的按下与释放时间差符合资产声明的毫秒偏移

### Requirement: 屏幕感知
`execution-engine` SHALL 提供区域截屏与全屏截屏，供锚点定位（模板匹配/找色）使用。截屏 SHALL 支持指定区域以控制性能开销。

#### Scenario: 模板锚定定位
- **WHEN** 锚点声明为 `img("buy.png", conf=0.8)` 且屏幕上存在该图案
- **THEN** 定位返回图像中心的物理像素坐标与置信度，置信度低于 0.8 时按锚点等待策略处理

### Requirement: 引擎事件上报
引擎 SHALL 通过 Tauri emit 上报结构化消息信封：`frame`（截屏+检测框）、`state(from, to, reason, ts)`、`log(level, msg)`。`state` 事件 SHALL 必含 `reason` 字段。

#### Scenario: 状态切换可观测
- **WHEN** 锚点定位从成功转为连续失败并触发 stuck 策略
- **THEN** UI 收到 `state(from=hunting, to=recovering, reason=stuck, ts=...)` 事件
