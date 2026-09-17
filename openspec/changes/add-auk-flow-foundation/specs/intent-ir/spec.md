## ADDED Requirements

### Requirement: 意图 IR 原语集
`intent-ir` SHALL 定义与语法无关的意图原语：`move/click/double_click/drag/press/type/scroll/wait/hover`，每类原语 SHALL 携带锚定目标或坐标、以及可选时序区间（形如 `300~800ms`）。IR SHALL NOT 包含任何轨迹、贝塞尔、抖动等物理细节。

#### Scenario: click 意图
- **WHEN** AST 中的 `Click, %fx%, %fy%` 带有 `;/* auk: click @shop.buy */` 指令
- **THEN** IR 产出 click 原语，目标为锚点 `shop.buy`，而非坐标数值

#### Scenario: 数值区间
- **WHEN** 源码含 `;/* auk: sleep jitter 300~800 */` 与 `Sleep, 500`
- **THEN** IR 的 wait 原语携带区间 [300, 800]，具体值由下游在每次运行时采样

### Requirement: 三层坐标解析
`intent-ir` SHALL 实现三层坐标：L1 脚本层（锚定引用/窗口百分比/屏幕绝对坐标兜底）→ L2 引擎层（统一物理像素，处理 DPI 缩放与多显示器，小数像素采用误差累积舍入）→ L3 模型层（方向 cos/sin、log₂ 距离、归一时长的归一化空间）。锚点解析 SHALL 在每次回放前重新执行（窗口可移动）。

#### Scenario: DPI 换算
- **WHEN** 系统显示缩放为 150% 且脚本给出窗口百分比坐标
- **THEN** L2 坐标为正确的物理像素值，点击命中预期目标

#### Scenario: L3 归一化往返
- **WHEN** 任一 L2 起终点对被变换到 L3 再反变换回 L2
- **THEN** 反变换结果与原值误差不超过 1 物理像素

#### Scenario: 锚点失效
- **WHEN** 回放时锚点目标（图像/窗口）在屏幕上不存在
- **THEN** 引擎 SHALL 按锚点声明的等待策略等待或报错终止，不得点击默认坐标 (0,0)

### Requirement: 控制流到 IR
`intent-ir` SHALL 将 AHK 的 `Loop/While/If/Break` 与热键触发编译为 IR 的线性跳转结构，语义与 AHK 定义一致。

#### Scenario: 循环展开时机的正确性
- **WHEN** 脚本循环体内含锚定 click
- **THEN** 每次循环迭代均重新执行锚点解析与拟人化生成（同一 click 每圈的轨迹与落点不同）
