## ADDED Requirements

### Requirement: 输入条件向量协议
`model-io-protocol` SHALL 冻结模型输入为任务条件 `[cosθ, sinθ, log₂D, T, mode]`（θ 方向角、D 距离、T 总时长预算、mode 连续/离散）⊕ `user_embed[64]`（个人适配层，冷启动时由参数拟合结果编码）⊕ `context[k]`（前序段落的终速/方向）。输入 SHALL NOT 使用绝对像素或裸角度。

#### Scenario: 分辨率无关
- **WHEN** 同一几何关系（方向/距离比例/时长）出现在不同分辨率屏幕上
- **THEN** 输入条件向量完全相同

#### Scenario: 冷启动嵌入衔接
- **WHEN** 用户仅有 V2 参数拟合结果而无个人模型
- **THEN** 拟合参数被编码进 `user_embed` 维度，模型内核可无缝消费（三段接力不断层）

### Requirement: 输出增量协议
模型输出 SHALL 为逐步增量 `[dt, dx, dy]` 加 EOS 概率维 `p_eos`（sigmoid）。输出 SHALL NOT 为绝对坐标。EOS 判据为位移趋零且 dt 拉长；训练 SHALL 采用两阶段结构（弹道段/校正段）的教师强制标签。

#### Scenario: 误差不累积
- **WHEN** 生成长序列（>64 步）
- **THEN** 输出以增量表示，序列语义不受绝对坐标回绕影响

### Requirement: 采样与终点兜底
推理 SHALL 对输出分布采样（含 σ 温度系数 τ，随 profile 可调），SHALL NOT 直接取均值 μ。当累积终点误差超过目标宽度 W 的 1/4 时，SHALL 追加一段规则生成的校正移动作为硬约束兜底。

#### Scenario: 均值退化防护
- **WHEN** 同一条件连续推理 100 次
- **THEN** 输出轨迹两两不同（非确定性退化为均值轨迹）

#### Scenario: 终点硬约束
- **WHEN** 采样累积终点误差为 0.3W（W 为目标宽度）
- **THEN** 引擎追加校正段，最终点击位置与目标的偏差不超过 W/8

### Requirement: 评估协议
模型验收 SHALL 包含：(a) 生成 vs 真迹的分布对比（速度剖面、曲率分布、总时长分布）；(b) 跨时间稳定性——同一用户不同日期的真迹与生成混合后不可分；(c) 判别器检验——训练二分类器区分该用户真迹与模型生成，通过线为 AUC≈0.5。

#### Scenario: 判别器验收
- **WHEN** 用通过验收的模型生成轨迹混入用户真迹训练判别器
- **THEN** 验证集 AUC 落在 0.5±0.05 区间（不可分）

### Requirement: 协议冻结与内核无关
本协议 SHALL 与模型结构解耦：模型结构（LSTM/Transformer 等）为实现细节。协议字段变更 SHALL 视为破坏性变更，需要新的 capability 版本。

#### Scenario: 结构替换
- **WHEN** V3 内核从 LSTM 换为其他结构
- **THEN** 输入输出协议字段不变，pass 接口与引擎集成不受影响
