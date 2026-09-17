## ADDED Requirements

### Requirement: HTML 靶场采集
`data-collection` SHALL 提供 HTML 靶场页面：随机呈现点目标（覆盖 50px~1500px 距离谱、八方向、随机出现延迟 0.5~2s 防预判），记录高精度 `pointermove` 事件流，每个 trial 以"目标出现→点击落地"为边界，标签（距离/方向/时长）自动派生。

#### Scenario: trial 结构化输出
- **WHEN** 用户完成一次靶场点击
- **THEN** 产出一个 trial 记录：`{points: [[t,x,y],...], dist, angle, duration, age_band?, device}`，时间戳为相对毫秒且起点为 0

### Requirement: 匿名格式与不聚合约束
落盘语料 SHALL 为匿名格式：单条 trial 独立存放，SHALL NOT 携带用户 ID、设备指纹、精确年龄或生日；年龄仅允许 5~10 年区间形式且为可选字段；同一来源的多条 trial SHALL NOT 共享任何可关联标识。

#### Scenario: 单条轨迹不可关联
- **WHEN** 审计任一语料文件中的单条 trial
- **THEN** 其全部字段组合无法回溯到特定自然人（无 ID、无指纹、年龄为区间）

### Requirement: 合规闸门
采集 SHALL 默认本地处理（L1/L2）：轨迹用于本地参数拟合后原始数据即可用即弃。任何将用户轨迹用于公共底座训练的上传行为（L3）SHALL 以单独 opt-in 同意为前提，且产品 SHALL 不采集 14 岁以下用户数据（年龄门）。

#### Scenario: 默认零上传
- **WHEN** 用户完成 V2 标定（2 分钟靶场）
- **THEN** 轨迹数据仅存在于本地，参数拟合完成后原始轨迹被丢弃，无任何网络上传

#### Scenario: 年龄门
- **WHEN** 用户声明年龄低于 14 周岁
- **THEN** 数据采集功能不可用，仅可使用规则内核

### Requirement: 脏数据剔除
入库前 SHALL 剔除：单 trial 内停顿 >2s 的段落、明显切窗/分心的 trial。剔除质量 SHALL 优先于数量。

#### Scenario: 停顿剔除
- **WHEN** 某 trial 中部存在 3 秒无事件间隔
- **THEN** 该 trial 被标记剔除或按停顿点切段，不得作为完整 trial 入库
