//! 编排策略：stuck 检测与疲劳节律。
//!
//! Spec: 引擎层全局运行时配置，不要求脚本语法支持，默认关闭。

use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StuckPolicy {
    /// 滞留多少毫秒判定 stuck
    pub threshold_ms: u64,
    /// stuck 后的动作
    pub action: StuckAction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StuckAction {
    /// 中断当前循环并上报 state(reason=stuck)，随后重试
    Retry,
    /// 终止回放
    Terminate,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FatiguePolicy {
    /// 每循环运行多少毫秒后插入休息
    pub work_ms: u64,
    /// 休息时长区间（毫秒）
    pub rest_min_ms: u64,
    pub rest_max_ms: u64,
}

/// 两者默认关闭 = None
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct RunPolicies {
    pub stuck: Option<StuckPolicy>,
    pub fatigue: Option<FatiguePolicy>,
}

/// stuck 检测器：观察同一执行节点/锚点的滞留时长
#[derive(Debug)]
pub struct StuckDetector {
    policy: StuckPolicy,
    since: Instant,
    label: String,
    fired: bool,
}

impl StuckDetector {
    pub fn start(policy: StuckPolicy, label: impl Into<String>) -> Self {
        Self {
            policy,
            since: Instant::now(),
            label: label.into(),
            fired: false,
        }
    }

    /// 节点离开/成功时调用（重置计时）
    pub fn reset(&mut self) {
        self.since = Instant::now();
        self.fired = false;
    }

    /// 检查是否滞留超阈值；触发一次后不重复触发（直到 reset）
    pub fn check(&mut self) -> Option<StuckReport> {
        if self.fired {
            return None;
        }
        let elapsed = self.since.elapsed();
        if elapsed >= Duration::from_millis(self.policy.threshold_ms) {
            self.fired = true;
            return Some(StuckReport {
                label: self.label.clone(),
                stuck_ms: elapsed.as_millis() as u64,
                action: self.policy.action,
            });
        }
        None
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct StuckReport {
    pub label: String,
    pub stuck_ms: u64,
    pub action: StuckAction,
}

/// 疲劳节律器：给出下一次强制休息的时刻与时长
#[derive(Debug)]
pub struct FatigueScheduler {
    policy: FatiguePolicy,
    next_rest: Instant,
    rng_draw: u64,
}

impl FatigueScheduler {
    pub fn start(policy: FatiguePolicy) -> Self {
        Self {
            policy,
            next_rest: Instant::now() + Duration::from_millis(policy.work_ms),
            rng_draw: 0,
        }
    }

    /// 返回 Some(休息时长) 当到达休息时刻；`draw` 为外部注入的均匀随机数 ∈ [0,1)
    pub fn poll(&mut self, draw: f64) -> Option<u64> {
        if Instant::now() >= self.next_rest {
            let span = (self.policy.rest_max_ms - self.policy.rest_min_ms) as f64;
            let rest = self.policy.rest_min_ms + (draw.clamp(0.0, 1.0) * span) as u64;
            self.rng_draw = rest;
            self.next_rest = Instant::now() + Duration::from_millis(self.policy.work_ms);
            Some(rest)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stuck_fires_once_then_reset() {
        let mut det = StuckDetector::start(
            StuckPolicy {
                threshold_ms: 0,
                action: StuckAction::Retry,
            },
            "anchor:buy",
        );
        let r1 = det.check().expect("fires at once for 0ms threshold");
        assert_eq!(r1.label, "anchor:buy");
        assert!(det.check().is_none(), "no repeat fire");
        det.reset();
        assert!(det.check().is_some(), "fires again after reset");
    }

    #[test]
    fn fatigue_rest_in_range() {
        let mut sched = FatigueScheduler::start(FatiguePolicy {
            work_ms: 0,
            rest_min_ms: 100,
            rest_max_ms: 300,
        });
        let rest = sched.poll(0.5).expect("rest due immediately");
        assert!((100..=300).contains(&rest), "{rest}");
        let min = sched.poll(0.0).expect("rest due after work cycle");
        assert_eq!(min, 100);
    }
}
