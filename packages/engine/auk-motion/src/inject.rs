//! 输入注入：用户态 API（明确不做内核驱动）。
//!
//! Windows: SendInput；其他平台暂以 Noop 后端占位（enigo 后续接入）。
//! 注：坐标约定 —— Move 事件的 (x, y) 为 0..1 归一化屏幕坐标，
//! 物理像素到归一坐标的换算由上层（L2 坐标层）完成。
//! Windows 分支在非 Windows CI 上不参与编译，改动需在 Windows 上验证。

use crate::events::InputEvent;

pub trait InputInjector {
    fn inject(&mut self, event: &InputEvent) -> Result<(), InjectError>;
}

#[derive(Debug, thiserror::Error)]
pub enum InjectError {
    #[error("input event rejected: {0}")]
    Rejected(String),
}

/// 无操作注入器（测试/预演模式：不触碰真实输入）
#[derive(Default)]
pub struct NoopInjector {
    pub injected: Vec<InputEvent>,
}

impl InputInjector for NoopInjector {
    fn inject(&mut self, event: &InputEvent) -> Result<(), InjectError> {
        self.injected.push(*event);
        Ok(())
    }
}

#[cfg(windows)]
pub struct SendInputInjector;

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use crate::events::Button;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_KEYUP, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
        MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS, VIRTUAL_KEY,
    };

    fn to_abs(v: f64) -> i32 {
        (v.clamp(0.0, 1.0) * 65535.0).round() as i32
    }

    /// 注：wheel 单位换算（WHEEL_DELTA=120）由调用方完成，data 传原始值
    fn mouse(dx: i32, dy: i32, data: i32, flags: u32) -> INPUT {
        let mut input = INPUT {
            r#type: INPUT_MOUSE,
            ..Default::default()
        };
        {
            input.Anonymous.mi = MOUSEINPUT {
                dx,
                dy,
                mouseData: data as u32,
                dwFlags: MOUSE_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: 0,
            };
        }
        input
    }

    fn key(code: VIRTUAL_KEY, up: bool) -> INPUT {
        let mut input = INPUT {
            r#type: INPUT_KEYBOARD,
            ..Default::default()
        };
        let flags = if up { KEYEVENTF_KEYUP.0 } else { 0 };
        {
            input.Anonymous.ki = KEYBDINPUT {
                wVk: code,
                wScan: 0,
                dwFlags: KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: 0,
            };
        }
        input
    }

    impl InputInjector for SendInputInjector {
        fn inject(&mut self, event: &InputEvent) -> Result<(), InjectError> {
            let inputs: Vec<INPUT> = match event {
                InputEvent::Move { x, y } => vec![mouse(
                    to_abs(*x),
                    to_abs(*y),
                    0,
                    MOUSEEVENTF_MOVE.0 | MOUSEEVENTF_ABSOLUTE.0,
                )],
                InputEvent::Button { button, down } => {
                    let flags = match (button, down) {
                        (Button::Left, true) => MOUSEEVENTF_LEFTDOWN,
                        (Button::Left, false) => MOUSEEVENTF_LEFTUP,
                        (Button::Right, true) => MOUSEEVENTF_RIGHTDOWN,
                        (Button::Right, false) => MOUSEEVENTF_RIGHTUP,
                        (Button::Middle, true) => MOUSEEVENTF_MIDDLEDOWN,
                        (Button::Middle, false) => MOUSEEVENTF_MIDDLEUP,
                    };
                    vec![mouse(0, 0, 0, flags.0)]
                }
                InputEvent::Key { code, down } => vec![key(VIRTUAL_KEY(*code), !*down)],
                InputEvent::Scroll { amount } => vec![mouse(0, 0, *amount, MOUSEEVENTF_WHEEL.0)],
            };
            let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
            if sent == inputs.len() as u32 {
                Ok(())
            } else {
                Err(InjectError::Rejected("SendInput partial failure".into()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noop_injector_records_events() {
        let mut inj = NoopInjector::default();
        inj.inject(&InputEvent::Move { x: 0.5, y: 0.5 }).unwrap();
        assert_eq!(inj.injected.len(), 1);
    }
}
