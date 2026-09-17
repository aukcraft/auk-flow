//! 截屏：区域/全屏。
//!
//! V1 目标平台为 Windows（DXGI/GDI 路径由 `screenshots` 类 crate 或直接
//! BitBlt 实现）。非 Windows CI 上提供合成帧后端用于测试锚定管线。
//! 接口与后端解耦：锚定层只依赖 `ScreenSource` trait。

use image::RgbaImage;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
pub type SystemCapture = PlatformCapture;

/// 截屏源 trait（区域/全屏，供锚定定位使用）
pub trait ScreenSource {
    fn capture_full(&mut self) -> Result<RgbaImage, CaptureError>;
    fn capture_region(&mut self, region: Region) -> Result<RgbaImage, CaptureError>;
}

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("region out of bounds: {0:?}")]
    OutOfBounds(Region),
    #[error("backend error: {0}")]
    Backend(String),
}

/// 确定性合成帧源（测试用）：纯色画布 + 指定位置画一个亮斑，
/// 供模板匹配的单元测试使用。
pub struct SyntheticSource {
    pub width: u32,
    pub height: u32,
    pub spot: Option<(u32, u32)>,
    pub spot_size: u32,
}

impl SyntheticSource {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            spot: None,
            spot_size: 8,
        }
    }

    pub fn with_spot(mut self, x: u32, y: u32) -> Self {
        self.spot = Some((x, y));
        self
    }

    fn render(&self) -> RgbaImage {
        let mut img = RgbaImage::from_pixel(self.width, self.height, [20, 20, 20, 255].into());
        if let Some((sx, sy)) = self.spot {
            let s = self.spot_size;
            for y in sy.saturating_sub(s)..(sy + s).min(self.height) {
                for x in sx.saturating_sub(s)..(sx + s).min(self.width) {
                    // 亮度向中心渐增 → 匹配峰值即中心
                    let d = ((x as i64 - sx as i64)
                        .abs()
                        .max((y as i64 - sy as i64).abs())) as u32;
                    let v = 255u32.saturating_sub(d * 255 / s.max(1));
                    img.put_pixel(x, y, [v as u8, v as u8, v as u8, 255].into());
                }
            }
        }
        img
    }
}

impl ScreenSource for SyntheticSource {
    fn capture_full(&mut self) -> Result<RgbaImage, CaptureError> {
        Ok(self.render())
    }

    fn capture_region(&mut self, region: Region) -> Result<RgbaImage, CaptureError> {
        if region.x + region.w > self.width || region.y + region.h > self.height {
            return Err(CaptureError::OutOfBounds(region));
        }
        let full = self.render();
        Ok(image::imageops::crop_imm(&full, region.x, region.y, region.w, region.h).to_image())
    }
}

/// 平台截屏后端。V1 Windows 实现走 GDI BitBlt（后续可换 DXGI）。
#[cfg(windows)]
pub struct PlatformCapture {
    pub width: u32,
    pub height: u32,
}

#[cfg(windows)]
impl ScreenSource for PlatformCapture {
    fn capture_full(&mut self) -> Result<RgbaImage, CaptureError> {
        // TODO(Windows): BitBlt 全屏到内存 DC → RgbaImage
        Err(CaptureError::Backend(
            "Windows capture not yet wired".into(),
        ))
    }
    fn capture_region(&mut self, _r: Region) -> Result<RgbaImage, CaptureError> {
        Err(CaptureError::Backend(
            "Windows capture not yet wired".into(),
        ))
    }
}

/// 非 Windows 平台后端：暂不可用（锚定测试用 SyntheticSource）。
#[cfg(not(windows))]
#[derive(Default)]
pub struct PlatformCapture;

#[cfg(not(windows))]
impl ScreenSource for PlatformCapture {
    fn capture_full(&mut self) -> Result<RgbaImage, CaptureError> {
        Err(CaptureError::Backend(
            "platform capture unavailable on this OS".into(),
        ))
    }
    fn capture_region(&mut self, _r: Region) -> Result<RgbaImage, CaptureError> {
        Err(CaptureError::Backend(
            "platform capture unavailable on this OS".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_spot_present() {
        let mut src = SyntheticSource::new(200, 100).with_spot(100, 50);
        let img = src.capture_full().unwrap();
        assert_eq!(img.dimensions(), (200, 100));
        let px = img.get_pixel(100, 50);
        assert_eq!(px.0[0], 255);
    }

    #[test]
    fn region_crop_bounds() {
        let mut src = SyntheticSource::new(100, 100);
        let ok = src.capture_region(Region {
            x: 10,
            y: 10,
            w: 50,
            h: 50,
        });
        assert!(ok.is_ok());
        let bad = src.capture_region(Region {
            x: 80,
            y: 80,
            w: 50,
            h: 50,
        });
        assert!(matches!(bad, Err(CaptureError::OutOfBounds(_))));
    }
}
