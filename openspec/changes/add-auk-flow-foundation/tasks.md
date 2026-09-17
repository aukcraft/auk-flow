# Tasks

## 1. 仓库骨架与工程基建

- [x] 1.1 初始化 monorepo：pnpm workspace、`packages/{core,ui,desktop,engine,plugin-core}` 目录、共享 tsconfig/eslint/vitest 基线
- [x] 1.2 建 Rust workspace `packages/engine`（crate 骨架、cargo fmt/clippy CI）
- [x] 1.3 迁入概念文档：`docs/auk-flow-concepts.md`（v1.1 全文）作为决策存档
- [x] 1.4 起草 `USAGE_POLICY.md` 初稿与 issue 模板（技术化表述引导，永不识别/只支持功能）

## 2. AHK 前端（packages/core）

- [x] 2.1 AHK v1 子集 lexer：白名单语句 token 化 + 行/列定位
- [x] 2.2 parser：白名单语句 → AST（含 `%var%`/表达式双写法等价处理）
- [x] 2.3 `;/* auk: */` 注释指令解析器（humanize/anchor/click @/sleep jitter 五类指令 + 未知指令报错）
- [x] 2.4 错误恢复与多错误报告；子集外语句（DllCall 等）拒绝清单测试
- [ ] 2.5 语料测试：收集 10 个真实开源 AHK v1 脚本片段作为解析回归用例

## 3. 意图 IR

- [x] 3.1 IR 原语定义（move/click/drag/press/type/scroll/wait/hover + 数值区间类型）
- [x] 3.2 AST → IR 编译（控制流转线性跳转；热键→触发器注册）
- [x] 3.3 三层坐标：L2 换算（DPI/多显/误差累积舍入）+ L3 归一化正反变换（往返误差 ≤1px 测试）
- [x] 3.4 锚点运行时解析接口（img/window 两类，每次迭代重解析；失效等待策略）

## 4. 拟人化 pass（V1 规则内核）

- [x] 4.1 pass 接口定义 `(起点,终点,上下文,profile) → [(dt,dx,dy)...]` + 内核注册机制
- [x] 4.2 WindMouse 轨迹生成（参数分布可配置，非恒定值）
- [x] 4.3 Fitts 时长估计 + 两阶段结构（弹道/过冲回调）
- [x] 4.4 区间采样器与点击落点分布（偏中心分布）；`humanize off` 精确模式确定性测试
- [x] 4.5 评估工位：直线/匀速检测脚本（10 条轨迹两两不同、时长 CV>0.05 自动验收）

## 5. 执行引擎（packages/engine, Rust）

- [x] 5.1 毫秒时序动作队列（高精度等待，派发偏差 ±2ms 基准测试）
- [x] 5.2 输入注入：SendInput/enigo（按下/释放/移动/滚轮四类事件）
- [x] 5.3 区域/全屏截屏（screenshots/DXGI）
- [x] 5.4 锚定定位：模板匹配 + 置信度阈值 + 等待策略
- [x] 5.5 stuck 检测与疲劳节律（引擎层全局配置，默认关闭）
- [x] 5.6 事件信封 emit（frame/state(from,to,reason,ts)/log）

## 6. Desktop 壳与面板

- [x] 6.1 Tauri 2.x 壳 + invoke/emit 桥接
- [ ] 6.2 RNW 时间盒闸门：Metro/打包/invoke 端到端验证（2 周内不通则降级 React DOM 并记录决策文档）
- [ ] 6.3 脚本编辑器（AHK + 注释指令高亮）与运行控制（启动/停止，停止 100ms 内停注）
- [ ] 6.4 监控面板：截屏+bbox 叠加、阈值实时调节、节点高亮/滞留标黄、日志流

## 7. V1 端到端闭环

- [ ] 7.1 全链路集成：AHK 脚本 → IR → 拟人化 → 引擎执行（示例脚本：ImageSearch + click + sleep jitter 循环）
- [ ] 7.2 `humanize off` 精确模式回归基线固化
- [ ] 7.3 端到端冒烟测试（Windows 优先）

## 8. 数据与协议冻结（规格物）

- [x] 8.1 HTML 靶场页面（随机点目标：距离谱/八方向/随机延迟；trial 结构化输出）
- [x] 8.2 匿名语料格式与审计工具（单条 trial 无 ID/无指纹/年龄区间化的自动校验）
- [x] 8.3 年龄门与默认零上传（本地即用即弃）实现
- [x] 8.4 `model-io-protocol` 协议文档定稿（条件向量/增量输出/p_eos/采样兜底/判别器验收），作为 V3 的冻结契约
