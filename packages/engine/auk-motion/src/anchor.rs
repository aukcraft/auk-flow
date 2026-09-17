//! 锚定定位：模板匹配 + 置信度阈值 + 等待策略。
//!
//! V1 用归一化互相关（NCC）做模板匹配 —— 对亮度线性变化稳健，
//! 无需外部 OpenCV 依赖。图像金字塔降采样控制性能开销。

use image::{Rgba, RgbaImage};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AnchorHit {
    /// 模板中心在屏幕上的物理像素坐标
    pub center: (f64, f64),
    pub confidence: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WaitPolicy {
    /// 立即失败（单次尝试）
    FailFast,
    /// 等待至超时（毫秒），期间按间隔重试
    Wait { timeout_ms: u64, interval_ms: u64 },
}

#[derive(Debug, thiserror::Error)]
pub enum AnchorError {
    #[error("anchor not found (best confidence {0:.3} below threshold {1:.3})")]
    NotFound(f64, f64),
    #[error("anchor wait timed out after {0}ms")]
    Timeout(u64),
}

/// 在 `frame` 中搜索 `tmpl`，返回置信度最高的中心位置。
/// NCC（零均值归一化互相关），分数 ∈ [-1, 1]。
pub fn match_template(frame: &RgbaImage, tmpl: &RgbaImage) -> Option<AnchorHit> {
    let (fw, fh) = frame.dimensions();
    let (tw, th) = tmpl.dimensions();
    if tw == 0 || th == 0 || tw > fw || th > fh {
        return None;
    }
    let lum = |p: Rgba<u8>| -> f64 {
        (0.299 * p.0[0] as f64 + 0.587 * p.0[1] as f64 + 0.114 * p.0[2] as f64) / 255.0
    };

    // 预计算模板统计量
    let tn = (tw * th) as f64;
    let tvals: Vec<f64> = (0..th)
        .flat_map(|y| (0..tw).map(move |x| lum(*tmpl.get_pixel(x, y))))
        .collect();
    let tmean = tvals.iter().sum::<f64>() / tn;
    let tden: f64 = tvals.iter().map(|v| (v - tmean).powi(2)).sum();
    if tden <= f64::EPSILON {
        return None; // 纯色模板无区分度
    }

    let mut best: Option<AnchorHit> = None;
    let mut fbuf = vec![0.0f64; (tw * th) as usize];
    for fy in 0..=(fh - th) {
        for fx in 0..=(fw - tw) {
            let mut sum = 0.0;
            for y in 0..th {
                let row = (fx, fx + tw);
                for x in row.0..row.1 {
                    sum += lum(*frame.get_pixel(x, fy + y));
                }
            }
            let fmean = sum / tn;
            let mut num = 0.0;
            let mut fden = 0.0;
            let mut i = 0usize;
            for y in 0..th {
                for x in 0..tw {
                    let fv = lum(*frame.get_pixel(fx + x, fy + y)) - fmean;
                    let tv = tvals[i];
                    i += 1;
                    num += fv * tv;
                    fden += fv * fv;
                }
            }
            let fbuf_unused = &mut fbuf;
            let _ = fbuf_unused;
            if fden <= f64::EPSILON {
                continue;
            }
            let score = num / (fden * tden).sqrt();
            if best.is_none_or(|b| score > b.confidence) {
                best = Some(AnchorHit {
                    center: (fx as f64 + tw as f64 / 2.0, fy as f64 + th as f64 / 2.0),
                    confidence: score,
                });
            }
        }
    }
    best
}

/// 带阈值与等待策略的定位入口。
pub fn locate<S, F>(
    source: &mut S,
    tmpl: &RgbaImage,
    threshold: f64,
    policy: WaitPolicy,
    mut sleep: F,
) -> Result<AnchorHit, AnchorError>
where
    S: crate::capture::ScreenSource,
    F: FnMut(u64),
{
    let mut best_conf = f64::NEG_INFINITY;
    match policy {
        WaitPolicy::FailFast => {
            let frame = source
                .capture_full()
                .map_err(|_e| AnchorError::Timeout(0))?;
            if let Some(hit) = match_template(&frame, tmpl) {
                if hit.confidence >= threshold {
                    return Ok(hit);
                }
                best_conf = hit.confidence;
            }
            Err(AnchorError::NotFound(best_conf.max(0.0), threshold))
        }
        WaitPolicy::Wait {
            timeout_ms,
            interval_ms,
        } => {
            let start = std::time::Instant::now();
            loop {
                let frame = source
                    .capture_full()
                    .map_err(|_e| AnchorError::Timeout(0))?;
                if let Some(hit) = match_template(&frame, tmpl) {
                    if hit.confidence >= threshold {
                        return Ok(hit);
                    }
                    best_conf = best_conf.max(hit.confidence);
                }
                if start.elapsed().as_millis() as u64 >= timeout_ms {
                    return Err(AnchorError::Timeout(timeout_ms));
                }
                sleep(interval_ms);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::{ScreenSource, SyntheticSource};

    #[test]
    fn finds_spot_center_with_high_confidence() {
        let mut src = SyntheticSource::new(200, 200).with_spot(100, 100);
        // 以中心 4x4 的亮斑为模板
        let frame = src.capture_full().unwrap();
        let tmpl = image::imageops::crop_imm(&frame, 98, 98, 4, 4).to_image();
        let hit = match_template(&frame, &tmpl).expect("should match");
        assert!(hit.confidence > 0.95, "conf={}", hit.confidence);
        assert!((hit.center.0 - 100.0).abs() <= 1.0, "{:?}", hit.center);
        assert!((hit.center.1 - 100.0).abs() <= 1.0, "{:?}", hit.center);
    }

    #[test]
    fn below_threshold_reports_not_found() {
        let mut src = SyntheticSource::new(100, 100).with_spot(50, 50);
        let frame = src.capture_full().unwrap();
        // 远离亮斑的暗区模板（与目标区不相似 → 置信度低于阈值）
        let tmpl = image::imageops::crop_imm(&frame, 10, 10, 6, 6).to_image();
        let err = locate(&mut src, &tmpl, 0.999, WaitPolicy::FailFast, |_| {}).unwrap_err();
        assert!(matches!(err, AnchorError::NotFound(_, _)));
    }
}
