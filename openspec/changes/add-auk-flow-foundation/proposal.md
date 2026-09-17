# AukFlow 基础工程（Phase 0）

## Why

AukFlow 的定位是"PC 优先的拟人化自动化引擎"——不造另一个按键精灵，而是补齐按键精灵生态缺失的那一半：行为拟人化（轨迹生成、时序建模、per-user 个性化）与现代架构（状态机可视化、可观测面板）。概念期设计（见 `docs/auk-flow-concepts.md`，v1.1）已完成收敛：法律边界、AHK-as-DSL 原型、模型 I/O 协议、数据合规策略均已定案。本变更将概念转化为可实施的工程蓝图，建立仓库骨架与 V1 闭环的最小规格。

## What Changes

- 建立 monorepo 骨架（对齐 auk-take 工程约定）：`packages/core`（纯 TS：AHK v1 子集解析 → IR）、`packages/ui`（RN 原语 + RNW，2 周时间盒闸门）、`packages/desktop`（Tauri 2.x 壳）、`packages/engine`（Rust：截屏/输入执行/ONNX 推理）
- **DSL 原型采用 AutoHotkey v1 语法子集**：扩展通过 `;/* auk: ... */` 注释指令挂载，脚本保持与真 AutoHotkey 双向兼容；编排策略（stuck/疲劳节律）下沉引擎层而非语法层
- 定义意图 IR 与三层坐标体系（L1 脚本锚定 / L2 引擎物理像素 / L3 模型归一化空间）
- 定义拟人化编译 pass 接口与模型 I/O 协议 v2：`[cosθ, sinθ, log₂D, T, mode] ⊕ user_embed ⊕ context → [dt, dx, dy] + p_eos`，采样输出 + 终点硬约束兜底
- V1 闭环（纯规则、零训练）：AHK 脚本 → IR → WindMouse + Fitts 拟人轨迹 → Rust 动作队列执行
- 数据合规基线：本地处理优先（L1/L2 免同意架构），采集仅匿名轨迹 + 年龄区间标签，无 ID 不聚合

## Capabilities

### New Capabilities

- `ahk-frontend`: AutoHotkey v1 语法子集的词法/语法解析，`;/* auk: */` 注释指令提取，产出 AST
- `intent-ir`: 意图中间表示：动作原语（click/drag/press/type/scroll/wait）、锚定引用、控制流；三层坐标解析管线
- `humanize-pass`: 拟人化编译 pass：意图序列 → 轨迹/时序展开；V1 为 WindMouse + Fitts + 过冲回调规则引擎，模型内核接口可替换
- `execution-engine`: Rust 执行层：毫秒时序动作队列、输入注入（SendInput/enigo）、截屏（screenshots/DXGI）、锚定目标定位（图像/窗口）
- `desktop-shell`: Tauri 壳与监控面板：脚本编辑、运行控制、检测框叠加、日志、参数调节；RNW 闸门决策
- `data-collection`: HTML 靶场采集与轨迹语料格式（`[[t,x,y],...]` 匿名、区间标签、无 ID 不聚合）、合规四闸门
- `model-io-protocol`: 模型输入输出协议冻结（条件向量、增量输出、EOS、采样与兜底、判别器 AUC≈0.5 验收）

### Modified Capabilities

（无——全新仓库，无既有规格）

## Impact

- **新建仓库**：`/_home/Codes/auk-flow`，从空目录起步
- **依赖**：Tauri 2.x、react-native-web、ort（ONNX Runtime Rust）、enigo/windows-rs、screenshots、scipy（V2 标定参数拟合）
- **不上游依赖 auk-take**：仅对齐其工程约定（monorepo 结构、core 纯逻辑包、plugin-core 边界）；auk-take v1 发布是本变更进入构建期的前置闸门
- **明确不做**：驱动级输入（DllCall 不进 AHK 子集白名单）、游戏对抗场景功能、v3 之前的模型训练
