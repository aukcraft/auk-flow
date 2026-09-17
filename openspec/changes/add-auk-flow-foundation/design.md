# AukFlow 基础工程设计

## Context

概念期（2026-09-15/16 讨论沉淀，`docs/auk-flow-concepts.md` v1.1）已完成：法律边界与防守方定位、四层架构（感知/思考/执行/监控）、拟人化引擎技术路线（WindMouse/最小急动度/Fitts → V3 LSTM 学分布）、数据合规三级架构（L1 实时流过 / L2 落盘真匿名 / L3 需单独同意）、三段接力个性化（参数拟合 → 静默累积 → LoRA/微调接管）。

本仓库为空目录，从零建立。工程约定对齐 auk-take（monorepo、core 纯逻辑包、plugin-core 边界），但不依赖其代码。

## Goals / Non-Goals

**Goals:**

- 建立可长期演进的 monorepo 骨架（core TS / ui RNW / desktop Tauri / engine Rust）
- V1 闭环：AHK 子集脚本 → IR → 规则拟人化（WindMouse+Fitts+过冲）→ Rust 毫秒时序执行
- 冻结模型 I/O 协议（V3 才实现模型，协议现在定死，避免返工）
- 数据合规从第一天内建于架构（本地处理优先、匿名轨迹格式）

**Non-Goals:**

- 不做驱动级输入（KDF/签名/HVCI 成本，且构成"功能专门性"法律风险）
- 不做游戏对抗场景的任何专门化（模板、话术、issue 受理均不出现）
- 不做模型训练（V3 范畴）；不实现 LoRA/个性化（V2 范畴）
- 不实现 DOM 锚定（v2 Web 场景增强）；不接 auk-take 代码
- 不完整支持 AHK 全语法——仅白名单子集

## Decisions

### D1 · DSL 原型 = AutoHotkey v1 语法子集 + 注释指令扩展

**选择**：以 AHK v1 语法为前端语言（非自研 DSL），auk-flow 扩展全部通过 `;/* auk: ... */` 注释挂载。

**理由**：30 年存量脚本生态冷启动（现有找图/挂机脚本 90%+ 为 v1 语法）；注释指令保证脚本在真 AutoHotkey 中依然合法可运行 → 双向兼容、可导出、不锁用户（继承"永不识别、只支持功能"的哲学：扩展是附加层，不动宿主语言合法性）。编排策略（stuck 检测、疲劳节律）没有语法位置 → 下沉到引擎层全局配置（它们本就是运行时策略）。

**备选**：自研 DSL（推迟——AHK 生态验证成功后可能永远不需要）；AHK v2 语法（存量少，弃）。

**子集白名单（v1 冻结）**：`Click/MouseClick/MouseMove`、`Sleep`、`ImageSearch/PixelSearch/PixelGetColor`、`Send/SendInput`、`WinActive/WinWait`、`Loop/While/If/Break`、`#IfWinActive` 热键。**排除**：`DllCall`（安全+法律红线）、COM 对象、文件写入类（逐步白名单化）。

**注解指令集（v1）**：`humanize on|off`、`humanize profile age=? style=?`、`anchor <name> = img(...)|selector(...)`、`click @<name>`、`sleep jitter <min>~<max>`。

### D2 · 编译管线与归属分层

```
AHK 源码 → [core TS: lexer/parser + 注释指令提取] → AST
        → [core TS: IR 生成 + 锚点解析] → 意图 IR
        → [core TS: humanize pass] → 轨迹/时序展开的动作流
        → [Tauri invoke] → [engine Rust: 毫秒时序动作队列派发]
```

解析器放纯 TS（vitest 可测、未来移动端复用）；执行在 Rust（时序敏感）。AHK 语法的历史包袱（表达式/传统模式双写法、`%var%`）在 parser 层消化，不污染 IR。

### D3 · 三层坐标体系

- **L1 脚本层**：锚定引用优先（`@anchor` / `@window %`），屏幕绝对坐标仅兜底
- **L2 引擎层**：统一物理像素，单显示器归一；处理 DPI 缩放/多显示器；小数像素用误差累积舍入
- **L3 模型层**：归一化空间（方向 cos/sin、log₂ 距离、时长归一）→ 分辨率无关、跨设备泛化
- 拟人化（含点击落点分布、抖动幅度随距离缩放）只发生在 L3，反变换回 L2 保持比例

### D4 · 拟人化 pass 内核可替换，协议冻结

| 版本 | 内核 | 特性 |
|------|------|------|
| V1 | WindMouse + Fitts + 过冲回调（纯规则） | 零训练，参数可配置分布 |
| V2 | + 标定参数拟合（scipy 反解 WindMouse 参数分布，零训练个性化） | 2 分钟冷启动 |
| V3 | 小型 LSTM（30-50 万参数，NLL 损失，输出 μ/σ，采样非取均值） | 学分布不学均值 |

pass 接口稳定：`(起点, 终点, 上下文, profile) → [(dt,dx,dy)...]`。模型结构是实现细节，**模型 I/O 协议才是规格**（见 `model-io-protocol` spec）。

### D5 · 引擎进程内，无 sidecar

截屏：`screenshots`/DXGI；输入：`SendInput`/`enigo`；推理：`ort`（ONNX）。Python 仅作离线训练工具，不进产品运行时。UI↔引擎走 Tauri invoke/emit。

### D6 · UI 层 RN 原语 + 2 周时间盒

RN 原语（View/Text/Pressable）经 react-native-web 跑 Tauri webview → 未来移动端零翻译成本；代价是放弃 shadcn/ui（监控面板可接受）。**闸门**：RNW+Tauri 链路（Metro/打包/invoke）2 周不通则 `ui` 包降级普通 React DOM，损失限于 shell 包。

### D7 · 数据合规内建（隐私架构即产品架构）

- 个人适配层本地训练、原始轨迹即用即弃 → L1/L2，无需同意弹窗
- 底座语料（V2+ 数据飞轮）：匿名轨迹 + 5~10 年年龄区间标签 + 设备类型；**无 ID、单条轨迹不与其他聚合**（鼠标轨迹的"操作声纹"可识别性 → 假名聚合即个人信息）
- 14 岁以下不采集；外部语料（Balabit/SQUAD 等）仅限研发评估，不分发
- per-user 适配文件按敏感个人信息对待：本地加密、可删除、不做跨账号比对

## Risks / Trade-offs

- [AHK v1 子集的兼容预期落差（用户脚本用了子集外语法）] → 明确的"不支持语句"错误报告 + 白名单渐进扩展；解析器输出清晰的行级错误
- [RNW+Tauri 链路不通] → D6 时间盒闸门，降级路径损失有限
- [纯采样轨迹的终点误差（自回归漂移）] → 终点硬约束兜底：误差 > W/4 追加规则生成校正段（V1 本就是规则内核，天然满足）
- [法律定性风险] → 遵循概念文档 1.3-1.4：永不识别、只支持功能；USAGE_POLICY.md 与 issue 模板随首版发布；DllCall 等不出现在白名单
- [拟人参数固定分布反而成指纹] → 参数配置化 + "周一/周五不可分"检验内建于评估协议
- [auk-take 前置闸门延期] → 本变更的 spec/design 不受影响；构建期启动以其 v1 发布为准，骨架任务可先行

## Migration Plan

空仓库起步，无迁移。构建顺序遵循版本路线：V1 规则闭环 → V2 标定 → V3 模型。ONNX 模型（V3）随版本分发，协议不变则引擎不换。

## Open Questions

- AHK 子集白名单的第二批扩展（文件读写、字符串处理）时机——待 V1 用户反馈
- `;/* auk: */` 指令与 AHK 的 `#IfWinActive` 热键区块的交互语义（热键触发的循环是否独立 humanize 上下文）
- RNW 闸门若降级，未来移动端是重写 ui 包还是届时再评估 RNW
