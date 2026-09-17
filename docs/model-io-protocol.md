# 模型 I/O 协议（v2 · 冻结契约）

> 冻结于 `add-auk-flow-foundation` 变更（openspec specs/model-io-protocol）。
> 本协议与模型结构解耦；字段变更视为破坏性变更。

## 输入（条件向量）

```
任务条件:  [cosθ, sinθ, log₂D, T, mode]
  θ        方向角（cos/sin 编码，避免 ±π 跳变）
  D        距离（log₂ 编码 → 分辨率无关）
  T        总时长预算（归一）
  mode     连续 / 离散（段间停顿语义不同）

个人适配:  user_embed[64]
  冷启动：V2 标定的 WindMouse 参数拟合结果编码进此向量（三段接力不断层）
  V3：本地微调产出的适配层输出

序列上下文: context[k]
  前序段落的终速（px/ms）与方向 —— 连点段间停顿建模
```

**禁止**：绝对像素坐标、裸角度（跨分辨率不可泛化）。

## 输出

```
逐步增量:  [dt, dx, dy] + p_eos (sigmoid)
  增量表示 → 误差不累积、长度可变
  EOS 判据：位移趋零且 dt 拉长；训练用两阶段（弹道/校正）教师强制标签
  移动端预留维度：[pressure, area, orientation]
```

## 推理

```
条件 → 逐步采样（禁止取 μ）→ 累积 → Rust 按时序派发
  σ 温度系数 τ 随 profile 可调（风格漂移：稳定像 A = 固定指纹）
  终点硬约束兜底：累积误差 > W/4 → 追加规则生成的校正段
```

## 验收（评估协议）

1. 分布对比：生成 vs 真迹（速度剖面 / 曲率分布 / 总时长分布）
2. 跨时间稳定：同用户不同日期真迹与生成混合不可分
3. 判别器检验：二分类器区分真迹 vs 生成，通过线 AUC ≈ 0.5（±0.05）

## 实现映射

| 协议成分 | 代码位置 |
| --- | --- |
| 条件向量构造 | `packages/core/src/ir/coords.ts`（toNormalized） |
| 增量流格式 | `packages/core/src/humanize/index.ts`（MoveStep） |
| 时序派发 | `packages/engine/auk-motion/src/queue.rs` |
| 采样 + 兜底 | humanize 内核（V1 规则内核为天然满足） |
