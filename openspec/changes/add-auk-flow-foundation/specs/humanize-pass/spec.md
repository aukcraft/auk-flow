## ADDED Requirements

### Requirement: 拟人化编译 pass 接口
`humanize-pass` SHALL 提供稳定接口：`(起点, 终点, 上下文, profile) → [(dt, dx, dy)...]` 动作增量序列。内核 SHALL 可替换（V1 规则 / V2 参数拟合 / V3 模型），接口不变时上层与引擎无需改动。

#### Scenario: 内核替换透明
- **WHEN** 内核从 WindMouse 规则替换为 ONNX 模型推理
- **THEN** 上游 IR 与下游动作队列的调用代码无需修改

### Requirement: V1 规则内核
V1 内核 SHALL 以 WindMouse（重力+风+阻尼物理模拟）、Fitts 定律时长估计 `T = a + b·log₂(D/W+1)`、两阶段结构（弹道接近 + 过冲回调校正）生成轨迹。时长分布 SHALL NOT 恒定——同一意图多次生成的总时长 SHALL 呈分布差异。

#### Scenario: 轨迹非直线匀速
- **WHEN** 对同一 (起点, 终点) 连续生成 10 条轨迹
- **THEN** 任意两条的逐点速度序列与曲率序列均不相同，无一条为匀速直线

#### Scenario: 时长分布
- **WHEN** 同一距离的移动生成 100 次
- **THEN** 总时长的变异系数大于 0.05（非恒定时序）

### Requirement: 拟人化开关与区间采样
`humanize off` 时 SHALL 退化为精确模式：区间取中值、锚点取中心、轨迹为直线路径。`humanize on` 时所有区间与落点 SHALL 每次运行重新采样。点击落点 SHALL 服从以目标中心为中心的分布（偏向中心），而非恒定中心像素。

#### Scenario: 精确模式确定性
- **WHEN** 同一脚本以 `humanize off` 运行两次
- **THEN** 两次生成的动作序列完全一致（可用作回归测试基线）

#### Scenario: 落点分布
- **WHEN** 对同一目标在拟人模式下点击 200 次
- **THEN** 落点散布于目标区域内，且距中心的分布向中心集中（无落点恒等于中心）

### Requirement: 编排策略下沉
stuck 检测（状态滞留 N 秒）与疲劳节律（周期性插入随机休息）SHALL 作为引擎层全局运行时配置提供，SHALL NOT 要求脚本语法支持。两项策略默认关闭。

#### Scenario: stuck 中断
- **WHEN** 配置"循环滞留 10s 中断"且某锚点连续 10 秒定位失败
- **THEN** 引擎中断当前循环并上报 `state(reason=stuck)` 事件，随后按配置重试或终止
