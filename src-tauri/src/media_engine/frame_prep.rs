use std::fmt;

pub const DEFAULT_PALETTE: &[u8] =
    b" `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";

#[derive(Debug)]
pub enum FramePrepError {
    InvalidDimensions { width: u32, height: u32 },
    InvalidRgbLength { expected: usize, actual: usize },
    InvalidRenderMode(u8),
}

impl fmt::Display for FramePrepError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDimensions { width, height } => {
                write!(f, "invalid RGB frame dimensions: {width}x{height}")
            }
            Self::InvalidRgbLength { expected, actual } => write!(
                f,
                "invalid RGB frame length: expected {expected} bytes, got {actual}"
            ),
            Self::InvalidRenderMode(mode) => write!(f, "invalid render mode: {mode}"),
        }
    }
}

impl std::error::Error for FramePrepError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    Text = 1,
    Color512 = 2,
    Color32k = 3,
    Color262k = 4,
    TrueColor = 5,
}

impl RenderMode {
    pub fn quantize_bits(self) -> u8 {
        match self {
            Self::Text | Self::TrueColor => 0,
            Self::Color262k => 2,
            Self::Color32k => 3,
            Self::Color512 => 5,
        }
    }

    pub fn from_u8(mode: u8) -> Result<Self, FramePrepError> {
        match mode {
            1 => Ok(Self::Text),
            2 => Ok(Self::Color512),
            3 => Ok(Self::Color32k),
            4 => Ok(Self::Color262k),
            5 => Ok(Self::TrueColor),
            _ => Err(FramePrepError::InvalidRenderMode(mode)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RgbFrame {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl RgbFrame {
    pub fn new(width: u32, height: u32, data: Vec<u8>) -> Result<Self, FramePrepError> {
        validate_rgb(width, height, data.len())?;
        Ok(Self {
            width,
            height,
            data,
        })
    }

    pub fn cell_count(&self) -> usize {
        self.width as usize * self.height as usize
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedFrame {
    pub width: u32,
    pub height: u32,
    pub cell_bytes: usize,
    pub data: Vec<u8>,
}

pub fn prepare_ascii_color_frame(
    frame: &RgbFrame,
    mode: RenderMode,
) -> Result<PreparedFrame, FramePrepError> {
    if mode == RenderMode::Text {
        return Err(FramePrepError::InvalidRenderMode(mode as u8));
    }

    let quantize_bits = mode.quantize_bits();
    let mut data = Vec::with_capacity(frame.cell_count() * 4);

    for rgb in frame.data.chunks_exact(3) {
        let r = rgb[0];
        let g = rgb[1];
        let b = rgb[2];
        data.push(gray_to_char(rgb_to_gray(r, g, b)));
        data.push(quantize(r, quantize_bits));
        data.push(quantize(g, quantize_bits));
        data.push(quantize(b, quantize_bits));
    }

    Ok(PreparedFrame {
        width: frame.width,
        height: frame.height,
        cell_bytes: 4,
        data,
    })
}

pub fn prepare_pixel_frame(frame: &RgbFrame) -> PreparedFrame {
    let mut data = Vec::with_capacity(frame.cell_count() * 3);

    for rgb in frame.data.chunks_exact(3) {
        data.push(rgb[2]);
        data.push(rgb[1]);
        data.push(rgb[0]);
    }

    PreparedFrame {
        width: frame.width,
        height: frame.height,
        cell_bytes: 3,
        data,
    }
}

pub fn prepare_text_frame(frame: &RgbFrame) -> String {
    let mut out =
        String::with_capacity(frame.cell_count() + frame.height.saturating_sub(1) as usize);
    let width = frame.width as usize;

    for (idx, rgb) in frame.data.chunks_exact(3).enumerate() {
        if idx > 0 && idx % width == 0 {
            out.push('\n');
        }
        out.push(char::from(gray_to_char(rgb_to_gray(
            rgb[0], rgb[1], rgb[2],
        ))));
    }

    out
}

fn validate_rgb(width: u32, height: u32, actual: usize) -> Result<(), FramePrepError> {
    if width == 0 || height == 0 {
        return Err(FramePrepError::InvalidDimensions { width, height });
    }
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(3))
        .ok_or(FramePrepError::InvalidDimensions { width, height })?;
    if actual != expected {
        return Err(FramePrepError::InvalidRgbLength { expected, actual });
    }
    Ok(())
}

fn gray_to_char(gray: u8) -> u8 {
    let step = (256 / DEFAULT_PALETTE.len()).max(1);
    let idx = (usize::from(gray) / step).min(DEFAULT_PALETTE.len() - 1);
    DEFAULT_PALETTE[idx]
}

fn rgb_to_gray(r: u8, g: u8, b: u8) -> u8 {
    let weighted = u32::from(r) * 299 + u32::from(g) * 587 + u32::from(b) * 114;
    ((weighted + 500) / 1000).min(255) as u8
}

fn quantize(value: u8, bits: u8) -> u8 {
    if bits == 0 {
        value
    } else {
        (value >> bits) << bits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepares_ascii_color_truecolor_frame() {
        let frame = RgbFrame::new(2, 1, vec![0, 0, 0, 255, 255, 255]).unwrap();
        let prepared = prepare_ascii_color_frame(&frame, RenderMode::TrueColor).unwrap();

        assert_eq!(prepared.width, 2);
        assert_eq!(prepared.height, 1);
        assert_eq!(prepared.cell_bytes, 4);
        assert_eq!(prepared.data, vec![b' ', 0, 0, 0, b'@', 255, 255, 255]);
    }

    #[test]
    fn quantizes_color_modes_like_python_server() {
        let frame = RgbFrame::new(1, 1, vec![255, 129, 3]).unwrap();
        let prepared = prepare_ascii_color_frame(&frame, RenderMode::Color262k).unwrap();

        assert_eq!(&prepared.data[1..4], &[252, 128, 0]);
        assert_eq!(RenderMode::Color512.quantize_bits(), 5);
        assert_eq!(RenderMode::Color32k.quantize_bits(), 3);
        assert_eq!(RenderMode::Color262k.quantize_bits(), 2);
        assert_eq!(RenderMode::TrueColor.quantize_bits(), 0);
    }

    #[test]
    fn prepares_pixel_frame_as_bgr() {
        let frame = RgbFrame::new(2, 1, vec![1, 2, 3, 10, 20, 30]).unwrap();
        let prepared = prepare_pixel_frame(&frame);

        assert_eq!(prepared.cell_bytes, 3);
        assert_eq!(prepared.data, vec![3, 2, 1, 30, 20, 10]);
    }

    #[test]
    fn prepares_text_frame_with_rows() {
        let frame =
            RgbFrame::new(2, 2, vec![0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]).unwrap();

        assert_eq!(prepare_text_frame(&frame), " @\n @");
    }

    #[test]
    fn rejects_bad_rgb_lengths() {
        let err = RgbFrame::new(2, 1, vec![0, 0, 0]).unwrap_err();
        assert!(matches!(err, FramePrepError::InvalidRgbLength { .. }));
    }
}
