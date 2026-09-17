## ADDED Requirements

### Requirement: AHK v1 子集解析
`ahk-frontend` SHALL 将 AutoHotkey v1 语法的白名单子集源码解析为结构化 AST。白名单 v1 冻结为：`Click/MouseClick/MouseMove`、`Sleep`、`ImageSearch/PixelSearch/PixelGetColor`、`Send/SendInput`、`WinActive/WinWait`、`Loop/While/If/Break`、`#IfWinActive` 热键、变量赋值与 `%var%`/表达式两种引用形式。

#### Scenario: 白名单语句解析
- **WHEN** 源码包含 `Click, 100, 200` 与 `Sleep, 500`
- **THEN** 解析产出对应的 click 与 wait AST 节点，无错误

#### Scenario: 子集外语句报告
- **WHEN** 源码包含 `DllCall("user32.dll", ...)` 等白名单外语句
- **THEN** 解析器 SHALL 拒绝并输出包含行号与语句文本的错误，不得静默跳过

#### Scenario: 双写法等价
- **WHEN** 同一逻辑分别以传统模式（`%var%`）与表达式（`% var`）书写
- **THEN** 两种形式 SHALL 产出语义等价的 AST

### Requirement: 注释指令提取
`ahk-frontend` SHALL 从 `;/* auk: ... */` 注释中提取 auk 扩展指令，且这些注释 SHALL NOT 影响脚本在真 AutoHotkey 中的合法性。v1 指令集冻结为：`humanize on|off`、`humanize profile age=<band> style=<name>`、`anchor <name> = img(path, conf=...) | selector(css)`、`click @<name>`、`sleep jitter <min>~<max>`。

#### Scenario: 指令与原生语句并存
- **WHEN** 脚本同时含 `;/* auk: humanize on */` 与原生 `Click, %fx%, %fy%`
- **THEN** 指令被提取为扩展元数据，原生语句照常进入 AST

#### Scenario: 未知指令
- **WHEN** 注释中出现未定义的 auk 指令
- **THEN** 解析器 SHALL 报错并指明指令名，不得忽略

#### Scenario: 脚本可移植
- **WHEN** 用户将含注释指令的脚本复制到真 AutoHotkey 运行
- **THEN** 脚本 SHALL 保持语法合法（注释被 AutoHotkey 忽略，脚本按精确模式执行）

### Requirement: 脏输入鲁棒性
解析器 SHALL 对语法错误输出行级定位信息（行号、列、意外 token），不得在首个错误后崩溃。

#### Scenario: 语法错误恢复
- **WHEN** 源码第 N 行存在语法错误
- **THEN** 错误消息包含行号 N 与 token 上下文，且解析器可继续报告后续独立错误
