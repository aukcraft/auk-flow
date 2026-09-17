//! 动作事件定义：与 core TS 侧 IR 动作流对应的最小事件集。

use serde::{Deserialize, Serialize};

/// 输入注入层支持的四类事件
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InputEvent {
    Move { x: f64, y: f64 },
    Button { button: Button, down: bool },
    Key { code: u16, down: bool },
    Scroll { amount: i32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Button {
    Left,
    Right,
    Middle,
}

/// 状态切换事件 —— `reason` 字段是排查异常的钥匙（spec 4.3）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StateChange {
    pub from: String,
    pub to: String,
    pub reason: String,
    /// Unix 毫秒时间戳
    pub ts: u64,
}

/// 引擎 → 面板的消息信封（统一三通道：frame / state / log）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PanelMessage {
    /// 截屏帧 + 检测框叠加数据（bbox 与置信度由面板 canvas 绘制）
    Frame {
        /// 帧序号
        seq: u64,
        /// 命中的锚点框（物理像素）
        boxes: Vec<AnchorBox>,
    },
    State(StateChange),
    Log {
        level: LogLevel,
        msg: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AnchorBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}
