//! auk-motion — AukFlow 执行引擎
//!
//! 分层（对应 specs/execution-engine）：
//! - `queue`    毫秒时序动作队列（派发偏差目标 ±2ms）
//! - `events`   输入事件 + 面板消息信封（frame/state/log）
//! - `inject`   输入注入（用户态 API，明确不做驱动级）
//! - `capture`  区域/全屏截屏（ScreenSource trait + 合成测试源）
//! - `anchor`   模板匹配锚定定位 + 置信度阈值 + 等待策略
//! - `policy`   stuck 检测与疲劳节律（引擎层全局配置，默认关闭）

pub mod anchor;
pub mod capture;
pub mod events;
pub mod inject;
pub mod policy;
pub mod queue;

pub use events::{Button, InputEvent, PanelMessage, StateChange};
pub use queue::{dispatch, DispatchStats, TimedEvent};
