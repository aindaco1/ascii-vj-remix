use std::sync::{Arc, Mutex};
use std::time::Instant;

pub const MAX_DIMENSION: u32 = 4096;
pub const MAX_FRAME_BYTES: usize = 4096 * 4096 * 4;

/// Owned, tightly packed, straight-alpha RGBA8. Transport pointers never escape
/// their adapter. Sequence numbers belong to the source session, not its peer.
#[derive(Debug, Clone)]
pub struct VideoFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub rate_n: u32,
    pub rate_d: u32,
    pub timecode: i64,
    pub received_at: Instant,
}

pub fn frame_len(width: u32, height: u32) -> Result<usize, String> {
    if width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err("Video dimensions must be between 1 and 4096 pixels".into());
    }
    let bytes = (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4))
        .filter(|n| *n <= MAX_FRAME_BYTES)
        .ok_or("Video frame exceeds the memory limit")?;
    Ok(bytes)
}

impl VideoFrame {
    pub fn new(width: u32, height: u32, rgba: Vec<u8>) -> Result<Self, String> {
        if rgba.len() != frame_len(width, height)? {
            return Err("Video frame length does not match its dimensions".into());
        }
        Ok(Self {
            width,
            height,
            rgba,
            rate_n: 60,
            rate_d: 1,
            timecode: i64::MAX,
            received_at: Instant::now(),
        })
    }

    pub fn from_rows(
        width: u32,
        height: u32,
        stride: usize,
        bytes: &[u8],
        bgra: bool,
        opaque: bool,
    ) -> Result<Self, String> {
        let len = frame_len(width, height)?;
        let row = width as usize * 4;
        let needed = stride
            .checked_mul(height as usize - 1)
            .and_then(|n| n.checked_add(row))
            .filter(|n| *n <= MAX_FRAME_BYTES)
            .ok_or("Video stride exceeds the memory limit")?;
        if stride < row || bytes.len() < needed {
            return Err("Invalid video row stride or frame length".into());
        }
        let mut rgba = Vec::with_capacity(len);
        for y in 0..height as usize {
            rgba.extend_from_slice(&bytes[y * stride..y * stride + row]);
        }
        for pixel in rgba.chunks_exact_mut(4) {
            if bgra {
                pixel.swap(0, 2);
            }
            if opaque {
                pixel[3] = 255;
            }
        }
        Self::new(width, height, rgba)
    }

    /// Binary IPC: magic, version, dimensions, rate and sequence, then RGBA.
    pub fn binary(&self, sequence: u64) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(32 + self.rgba.len());
        bytes.extend_from_slice(b"AVIO");
        for value in [1, self.width, self.height, self.rate_n, self.rate_d] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(&sequence.to_le_bytes());
        bytes.extend_from_slice(&self.rgba);
        bytes
    }
}

/// A single replaceable pending frame. Consumers retain an Arc only while using
/// it; there is no growing live-video queue.
#[derive(Debug, Default)]
pub struct LatestFrame(Mutex<(u64, Option<Arc<VideoFrame>>)>);

impl LatestFrame {
    pub fn clear(&self) {
        if let Ok(mut slot) = self.0.lock() {
            slot.0 = slot.0.wrapping_add(1).max(1);
            slot.1 = None;
        }
    }
    pub fn set(&self, frame: VideoFrame) {
        if let Ok(mut slot) = self.0.lock() {
            slot.0 = slot.0.wrapping_add(1).max(1);
            slot.1 = Some(Arc::new(frame));
        }
    }
    pub fn get(&self, after: u64) -> Option<(u64, Arc<VideoFrame>)> {
        let slot = self.0.lock().ok()?;
        (slot.0 != after)
            .then(|| slot.1.as_ref().map(|frame| (slot.0, frame.clone())))
            .flatten()
    }
}

pub fn unpremultiply(rgba: &mut [u8]) {
    for p in rgba.chunks_exact_mut(4) {
        let a = u32::from(p[3]);
        for c in &mut p[..3] {
            *c = if a == 0 {
                0
            } else {
                ((u32::from(*c) * 255 + a / 2) / a).min(255) as u8
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unbounded_or_misaligned_frames() {
        assert!(frame_len(0, 10).is_err());
        assert!(frame_len(u32::MAX, 10).is_err());
        assert!(VideoFrame::new(1, 1, vec![0; 3]).is_err());
        assert!(VideoFrame::from_rows(2, 1, 4, &[0; 8], false, false).is_err());
    }
    #[test]
    fn padded_bgra_preserves_black_and_partial_alpha() {
        let f = VideoFrame::from_rows(
            1,
            2,
            8,
            &[30, 20, 10, 127, 9, 9, 9, 9, 0, 0, 0, 255],
            true,
            false,
        )
        .unwrap();
        assert_eq!(f.rgba, [10, 20, 30, 127, 0, 0, 0, 255]);
    }
    #[test]
    fn latest_frame_replaces_pending_and_keeps_borrowed_frame_alive() {
        let slot = LatestFrame::default();
        slot.set(VideoFrame::new(1, 1, vec![1; 4]).unwrap());
        let (seq, old) = slot.get(0).unwrap();
        assert!(slot.get(seq).is_none());
        for n in 2..100 {
            slot.set(VideoFrame::new(1, 1, vec![n; 4]).unwrap());
        }
        assert_eq!(old.rgba, [1; 4]);
        assert_eq!(slot.get(seq).unwrap().1.rgba, [99; 4]);
    }
    #[test]
    fn alpha_conversion_handles_zero_and_soft_edges() {
        let mut p = [255, 255, 255, 0, 64, 32, 0, 128];
        unpremultiply(&mut p);
        assert_eq!(p, [0, 0, 0, 0, 128, 64, 0, 128]);
    }
}
