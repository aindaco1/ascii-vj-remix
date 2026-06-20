use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::fmt;
use std::io::{Read, Write};

pub const TAG_RAW: u8 = 0;
pub const TAG_ZLIB: u8 = 1;
pub const TAG_DELTA: u8 = 2;

pub const DEFAULT_LEVEL: u32 = 3;
pub const KEYFRAME_INTERVAL: u32 = 48;

const DELTA_MAX_FRAC: f64 = 0.60;
const ZLIB_MIN_FRAC: f64 = 0.10;

#[derive(Debug)]
pub enum CodecError {
    InvalidCellBytes(usize),
    InvalidFrameLength { len: usize, cell_bytes: usize },
    InvalidMessage,
    DeltaWithoutPreviousFrame,
    MalformedDelta { len: usize, cell_bytes: usize },
    Zlib(std::io::Error),
}

impl fmt::Display for CodecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCellBytes(cell_bytes) => {
                write!(f, "invalid cell byte width: {cell_bytes}")
            }
            Self::InvalidFrameLength { len, cell_bytes } => {
                write!(
                    f,
                    "frame length {len} is not divisible by cell byte width {cell_bytes}"
                )
            }
            Self::InvalidMessage => write!(f, "invalid ASCILINE codec message"),
            Self::DeltaWithoutPreviousFrame => {
                write!(f, "delta frame cannot be decoded without a previous frame")
            }
            Self::MalformedDelta { len, cell_bytes } => {
                write!(
                    f,
                    "malformed delta payload length {len} for cell byte width {cell_bytes}"
                )
            }
            Self::Zlib(error) => write!(f, "zlib error: {error}"),
        }
    }
}

impl std::error::Error for CodecError {}

impl From<std::io::Error> for CodecError {
    fn from(error: std::io::Error) -> Self {
        Self::Zlib(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedFrame {
    pub frame_index: u32,
    pub frame: Vec<u8>,
}

#[derive(Debug, Clone)]
struct Candidate {
    tag: u8,
    payload: Vec<u8>,
    shown: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct Encoder {
    cell_bytes: usize,
    level: u32,
    tolerance: u8,
    previous_shown: Option<Vec<u8>>,
}

impl Encoder {
    pub fn new(cell_bytes: usize) -> Result<Self, CodecError> {
        Self::with_options(cell_bytes, DEFAULT_LEVEL, 0)
    }

    pub fn with_options(cell_bytes: usize, level: u32, tolerance: u8) -> Result<Self, CodecError> {
        validate_cell_bytes(cell_bytes)?;
        Ok(Self {
            cell_bytes,
            level,
            tolerance,
            previous_shown: None,
        })
    }

    pub fn reset(&mut self) {
        self.previous_shown = None;
    }

    pub fn previous_shown(&self) -> Option<&[u8]> {
        self.previous_shown.as_deref()
    }

    pub fn encode(&mut self, frame: &[u8], frame_index: u32) -> Result<Vec<u8>, CodecError> {
        validate_frame(frame, self.cell_bytes)?;

        let keyframe = self
            .previous_shown
            .as_ref()
            .map(|prev| prev.len() != frame.len())
            .unwrap_or(true)
            || frame_index % KEYFRAME_INTERVAL == 0;

        if keyframe {
            let message = full_frame(frame, frame_index, self.level)?;
            self.previous_shown = Some(frame.to_vec());
            return Ok(message);
        }

        let prev = self
            .previous_shown
            .as_ref()
            .expect("previous frame checked above");
        let changed = changed_cells(frame, prev, self.cell_bytes, self.tolerance);
        let cell_count = frame.len() / self.cell_bytes;
        let frac = changed.len() as f64 / cell_count as f64;

        let mut delta_shown = prev.clone();
        for &cell in &changed {
            let start = cell * self.cell_bytes;
            delta_shown[start..start + self.cell_bytes]
                .copy_from_slice(&frame[start..start + self.cell_bytes]);
        }

        let mut candidates = Vec::new();

        if frac < DELTA_MAX_FRAC {
            let mut body = Vec::with_capacity(changed.len() * (4 + self.cell_bytes));
            for &cell in &changed {
                body.extend_from_slice(&(cell as u32).to_le_bytes());
            }
            for &cell in &changed {
                let start = cell * self.cell_bytes;
                body.extend_from_slice(&frame[start..start + self.cell_bytes]);
            }
            candidates.push(Candidate {
                tag: TAG_DELTA,
                payload: zlib_compress(&body, self.level)?,
                shown: delta_shown,
            });
        }

        if frac >= ZLIB_MIN_FRAC || candidates.is_empty() {
            candidates.push(Candidate {
                tag: TAG_ZLIB,
                payload: zlib_compress(frame, self.level)?,
                shown: frame.to_vec(),
            });
        }

        let mut best = candidates
            .into_iter()
            .min_by_key(|candidate| candidate.payload.len())
            .expect("at least one candidate is always available");

        if frame.len() < best.payload.len() {
            best = Candidate {
                tag: TAG_RAW,
                payload: frame.to_vec(),
                shown: frame.to_vec(),
            };
        }

        let mut message = Vec::with_capacity(5 + best.payload.len());
        message.extend_from_slice(&frame_index.to_be_bytes());
        message.push(best.tag);
        message.extend_from_slice(&best.payload);

        self.previous_shown = Some(best.shown);
        Ok(message)
    }
}

#[derive(Debug, Clone)]
pub struct Decoder {
    cell_bytes: usize,
    previous: Option<Vec<u8>>,
}

impl Decoder {
    pub fn new(cell_bytes: usize) -> Result<Self, CodecError> {
        validate_cell_bytes(cell_bytes)?;
        Ok(Self {
            cell_bytes,
            previous: None,
        })
    }

    pub fn reset(&mut self) {
        self.previous = None;
    }

    pub fn decode(&mut self, message: &[u8]) -> Result<DecodedFrame, CodecError> {
        if message.len() < 5 {
            return Err(CodecError::InvalidMessage);
        }

        let frame_index = u32::from_be_bytes([message[0], message[1], message[2], message[3]]);
        let tag = message[4];
        let payload = &message[5..];

        let frame = match tag {
            TAG_RAW => payload.to_vec(),
            TAG_ZLIB => zlib_decompress(payload)?,
            TAG_DELTA => {
                let prev = self
                    .previous
                    .as_ref()
                    .ok_or(CodecError::DeltaWithoutPreviousFrame)?;
                let body = zlib_decompress(payload)?;
                let unit = 4 + self.cell_bytes;
                if body.len() % unit != 0 {
                    return Err(CodecError::MalformedDelta {
                        len: body.len(),
                        cell_bytes: self.cell_bytes,
                    });
                }

                let changed_count = body.len() / unit;
                let values_offset = changed_count * 4;
                let mut frame = prev.clone();

                for j in 0..changed_count {
                    let idx_start = j * 4;
                    let cell = u32::from_le_bytes([
                        body[idx_start],
                        body[idx_start + 1],
                        body[idx_start + 2],
                        body[idx_start + 3],
                    ]) as usize;
                    let dst = cell * self.cell_bytes;
                    let src = values_offset + j * self.cell_bytes;
                    if dst + self.cell_bytes > frame.len() || src + self.cell_bytes > body.len() {
                        return Err(CodecError::MalformedDelta {
                            len: body.len(),
                            cell_bytes: self.cell_bytes,
                        });
                    }
                    frame[dst..dst + self.cell_bytes]
                        .copy_from_slice(&body[src..src + self.cell_bytes]);
                }

                frame
            }
            _ => return Err(CodecError::InvalidMessage),
        };

        validate_frame(&frame, self.cell_bytes)?;
        self.previous = Some(frame.clone());
        Ok(DecodedFrame { frame_index, frame })
    }
}

fn full_frame(raw: &[u8], frame_index: u32, level: u32) -> Result<Vec<u8>, CodecError> {
    let compressed = zlib_compress(raw, level)?;
    let (tag, payload) = if compressed.len() < raw.len() {
        (TAG_ZLIB, compressed)
    } else {
        (TAG_RAW, raw.to_vec())
    };

    let mut message = Vec::with_capacity(5 + payload.len());
    message.extend_from_slice(&frame_index.to_be_bytes());
    message.push(tag);
    message.extend_from_slice(&payload);
    Ok(message)
}

fn changed_cells(frame: &[u8], prev: &[u8], cell_bytes: usize, tolerance: u8) -> Vec<usize> {
    frame
        .chunks_exact(cell_bytes)
        .zip(prev.chunks_exact(cell_bytes))
        .enumerate()
        .filter_map(|(idx, (next_cell, prev_cell))| {
            let changed = if cell_bytes == 4 {
                next_cell[0] != prev_cell[0]
                    || color_channels_changed(&next_cell[1..], &prev_cell[1..], tolerance)
            } else {
                color_channels_changed(next_cell, prev_cell, tolerance)
            };
            changed.then_some(idx)
        })
        .collect()
}

fn color_channels_changed(next: &[u8], prev: &[u8], tolerance: u8) -> bool {
    next.iter().zip(prev.iter()).any(|(a, b)| {
        let diff = a.abs_diff(*b);
        if tolerance == 0 {
            diff != 0
        } else {
            diff > tolerance
        }
    })
}

fn zlib_compress(bytes: &[u8], level: u32) -> Result<Vec<u8>, CodecError> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::new(level));
    encoder.write_all(bytes)?;
    Ok(encoder.finish()?)
}

fn zlib_decompress(bytes: &[u8]) -> Result<Vec<u8>, CodecError> {
    let mut decoder = ZlibDecoder::new(bytes);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}

fn validate_cell_bytes(cell_bytes: usize) -> Result<(), CodecError> {
    match cell_bytes {
        3 | 4 => Ok(()),
        _ => Err(CodecError::InvalidCellBytes(cell_bytes)),
    }
}

fn validate_frame(frame: &[u8], cell_bytes: usize) -> Result<(), CodecError> {
    validate_cell_bytes(cell_bytes)?;
    if frame.len() % cell_bytes != 0 {
        return Err(CodecError::InvalidFrameLength {
            len: frame.len(),
            cell_bytes,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_message_tag(message: &[u8]) -> u8 {
        message[4]
    }

    fn ascii_frame(cells: usize, ch: u8, r: u8, g: u8, b: u8) -> Vec<u8> {
        let mut frame = Vec::with_capacity(cells * 4);
        for _ in 0..cells {
            frame.extend_from_slice(&[ch, r, g, b]);
        }
        frame
    }

    fn pixel_frame(cells: usize, b: u8, g: u8, r: u8) -> Vec<u8> {
        let mut frame = Vec::with_capacity(cells * 3);
        for _ in 0..cells {
            frame.extend_from_slice(&[b, g, r]);
        }
        frame
    }

    #[test]
    fn keyframe_round_trips() {
        let frame = b"ABCDWXYZ".to_vec();
        let mut encoder = Encoder::new(4).unwrap();
        let message = encoder.encode(&frame, 1).unwrap();

        let mut decoder = Decoder::new(4).unwrap();
        let decoded = decoder.decode(&message).unwrap();

        assert_eq!(decoded.frame_index, 1);
        assert_eq!(decoded.frame, frame);
    }

    #[test]
    fn delta_round_trips_from_previous_frame() {
        let first = ascii_frame(128, b'A', 10, 20, 30);
        let mut second = first.clone();
        second[17] = 41;

        let mut encoder = Encoder::new(4).unwrap();
        let first_message = encoder.encode(&first, 1).unwrap();
        let second_message = encoder.encode(&second, 2).unwrap();

        let mut decoder = Decoder::new(4).unwrap();
        assert_eq!(decoder.decode(&first_message).unwrap().frame, first);
        assert_eq!(decoder.decode(&second_message).unwrap().frame, second);
        assert_eq!(decode_message_tag(&second_message), TAG_DELTA);
    }

    #[test]
    fn ascii_tolerance_keeps_character_exact_and_bounds_color() {
        let first = ascii_frame(128, b'A', 10, 20, 30);
        let mut second = first.clone();
        second[0] = b'Z';
        second[1] = 11;
        second[2] = 21;
        second[3] = 31;
        second[41] = 42;
        second[42] = 51;
        second[43] = 29;

        let mut encoder = Encoder::with_options(4, DEFAULT_LEVEL, 5).unwrap();
        let first_message = encoder.encode(&first, 1).unwrap();
        let second_message = encoder.encode(&second, 2).unwrap();

        let shown = encoder.previous_shown().unwrap().to_vec();
        let mut expected = first.clone();
        expected[0] = b'Z';
        expected[1] = 11;
        expected[2] = 21;
        expected[3] = 31;
        expected[41] = 42;
        expected[42] = 51;
        expected[43] = 29;
        assert_eq!(shown, expected);

        let mut decoder = Decoder::new(4).unwrap();
        assert_eq!(decoder.decode(&first_message).unwrap().frame, first);
        assert_eq!(decoder.decode(&second_message).unwrap().frame, shown);
    }

    #[test]
    fn pixel_tolerance_holds_small_color_drift() {
        let first = pixel_frame(128, 10, 20, 30);
        let mut second = first.clone();
        second[0] = 12;
        second[1] = 21;
        second[2] = 29;
        second[31] = 57;

        let mut encoder = Encoder::with_options(3, DEFAULT_LEVEL, 5).unwrap();
        let first_message = encoder.encode(&first, 1).unwrap();
        let second_message = encoder.encode(&second, 2).unwrap();

        let shown = encoder.previous_shown().unwrap().to_vec();
        let mut expected = first.clone();
        expected[31] = 57;
        assert_eq!(shown, expected);

        let mut decoder = Decoder::new(3).unwrap();
        assert_eq!(decoder.decode(&first_message).unwrap().frame, first);
        assert_eq!(decoder.decode(&second_message).unwrap().frame, shown);
    }

    #[test]
    fn decoder_rejects_delta_without_previous_frame() {
        let mut encoder = Encoder::new(4).unwrap();
        let first = ascii_frame(128, b'A', 1, 2, 3);
        let mut second = first.clone();
        second[7] = 4;
        encoder.encode(&first, 1).unwrap();
        let delta = encoder.encode(&second, 2).unwrap();
        assert_eq!(decode_message_tag(&delta), TAG_DELTA);

        let mut decoder = Decoder::new(4).unwrap();
        assert!(matches!(
            decoder.decode(&delta),
            Err(CodecError::DeltaWithoutPreviousFrame)
        ));
    }
}
