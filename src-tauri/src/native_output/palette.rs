use serde::Deserialize;
use std::sync::LazyLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Contract {
    pub max_colors: usize,
    pub max_cycle_ranges: usize,
    pub max_speed: f64,
}

pub(super) static CONTRACT: LazyLock<Contract> = LazyLock::new(||
    serde_json::from_str(include_str!("../../../renderers/shared/palette-contract.json"))
        .expect("bundled palette contract"));

static CLOCK: LazyLock<(Instant, f64)> = LazyLock::new(|| (Instant::now(),
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs_f64() * 1000.0));

pub(super) fn now_ms() -> f64 { CLOCK.1 + CLOCK.0.elapsed().as_secs_f64() * 1000.0 }

#[derive(Debug, Clone, Deserialize)]
pub struct CycleRange {
    pub start: usize,
    pub end: usize,
    pub rate: f64,
    #[serde(default = "forward")]
    pub direction: i32,
    #[serde(default)]
    pub offset: f64,
}
fn forward() -> i32 { 1 }

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Transport {
    pub anchor_ms: f64,
    pub position: f64,
    pub from_rate: f64,
    pub to_rate: f64,
    pub duration_ms: f64,
}

impl Transport {
    pub fn validated(value: Option<&Self>) -> Self {
        let Some(value) = value else { return Self::default() };
        if ![value.anchor_ms, value.position, value.from_rate, value.to_rate, value.duration_ms].iter().all(|n| n.is_finite()) ||
            value.position.abs() > 1.0e12 || value.anchor_ms.abs() > 1.0e15 ||
            value.from_rate.abs() > CONTRACT.max_speed || value.to_rate.abs() > CONTRACT.max_speed ||
            !(0.0..=8000.0).contains(&value.duration_ms) { return Self::default(); }
        value.clone()
    }

    // Reconcile the sender clock on every state sync, including reopen/resume.
    // Packet latency is the only phase uncertainty; wall-clock changes never animate a frame.
    pub fn synchronized(value: Option<&Self>, sender_now: Option<f64>, now: f64) -> Self {
        let mut transport = Self::validated(value);
        if let Some(sender) = sender_now.filter(|n| n.is_finite() && n.abs() <= 1.0e15) {
            transport.anchor_ms += now - sender;
        }
        transport
    }

    pub fn time_at(&self, now: f64) -> f64 {
        let elapsed = (now - self.anchor_ms) / 1000.0;
        let duration = self.duration_ms / 1000.0;
        if elapsed <= 0.0 { return self.position + elapsed * self.from_rate; }
        if duration > 0.0 && elapsed < duration {
            let t = elapsed / duration;
            let integral = if t <= 0.5 { 2.0 * t.powi(3) / 3.0 }
                else { -t + 2.0 * t * t - 2.0 * t.powi(3) / 3.0 + 1.0 / 6.0 };
            return self.position + self.from_rate * elapsed + (self.to_rate - self.from_rate) * duration * integral;
        }
        self.position + (if duration > 0.0 { duration * (self.from_rate + self.to_rate) / 2.0 } else { 0.0 }) +
            (elapsed - duration.max(0.0)).max(0.0) * self.to_rate
    }
}

pub(super) fn validated_ranges(ranges: &[CycleRange], count: usize) -> Vec<CycleRange> {
    if ranges.len() > CONTRACT.max_cycle_ranges { return Vec::new(); }
    let mut occupied = vec![false; count.min(CONTRACT.max_colors)];
    for range in ranges {
        if range.start >= range.end || range.end >= occupied.len() || !range.rate.is_finite() ||
            range.rate <= 0.0 || range.rate > 60.0 || ![-1, 1].contains(&range.direction) ||
            !range.offset.is_finite() || range.offset.abs() > 256.0 { return Vec::new(); }
        for slot in occupied.iter_mut().take(range.end + 1).skip(range.start) {
            if *slot { return Vec::new(); }
            *slot = true;
        }
    }
    ranges.to_vec()
}

pub(super) fn fill_display(target: &mut [f32], colors: &[[u8; 3]], ranges: &[CycleRange], mode: &str, amount: f64, time: f64) {
    for (i, color) in colors.iter().enumerate() {
        for c in 0..3 { target[i * 4 + c] = f32::from(color[c]) / 255.0; }
        target[i * 4 + 3] = ((f64::from(color[0]) * 0.2126 + f64::from(color[1]) * 0.7152 + f64::from(color[2]) * 0.0722) / 255.0) as f32;
    }
    if mode == "off" || amount == 0.0 { return; }
    for range in ranges {
        let length = (range.end - range.start + 1) as f64;
        let phase = time * range.rate * f64::from(range.direction) + range.offset;
        let step = phase.floor();
        let blend = if mode == "blend" { phase - step } else { 0.0 };
        for i in range.start..=range.end {
            let a = colors[range.start + ((i - range.start) as f64 + step).rem_euclid(length) as usize];
            let b = colors[range.start + ((i - range.start) as f64 + step + 1.0).rem_euclid(length) as usize];
            for c in 0..3 {
                let base = f64::from(colors[i][c]);
                let mixed = f64::from(a[c]) + (f64::from(b[c]) - f64::from(a[c])) * blend;
                target[i * 4 + c] = ((base + (mixed - base) * amount) / 255.0) as f32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_vectors_cover_cycle_and_clock_parity() {
        let vectors: serde_json::Value = serde_json::from_str(include_str!("../../../renderers/shared/palette-cycle-vectors.json")).unwrap();
        let colors: Vec<[u8; 3]> = serde_json::from_value(vectors["colors"].clone()).unwrap();
        let ranges: Vec<CycleRange> = serde_json::from_value(vectors["ranges"].clone()).unwrap();
        let mut display = vec![0.0; CONTRACT.max_colors * 4];
        for case in vectors["cases"].as_array().unwrap() {
            fill_display(&mut display, &colors, &ranges, case["mode"].as_str().unwrap(), case["amount"].as_f64().unwrap(), case["time"].as_f64().unwrap());
            let expected: Vec<[u8; 3]> = serde_json::from_value(case["rgb"].clone()).unwrap();
            for (i, color) in expected.iter().enumerate() {
                for c in 0..3 { assert_eq!((display[i * 4 + c] * 255.0).round() as u8, color[c]); }
                let base = colors[i];
                let luma = f64::from(base[0]) * 0.2126 + f64::from(base[1]) * 0.7152 + f64::from(base[2]) * 0.0722;
                assert!((f64::from(display[i * 4 + 3]) * 255.0 - luma).abs() < 0.0001);
            }
        }
        let clock: Transport = serde_json::from_value(vectors["clock"].clone()).unwrap();
        for case in vectors["clockCases"].as_array().unwrap() {
            assert!((clock.time_at(case[0].as_f64().unwrap()) - case[1].as_f64().unwrap()).abs() < 1.0e-9);
        }
        let rebased = Transport::synchronized(Some(&clock), Some(2000.0), 902000.0);
        assert!((rebased.time_at(903000.0) - clock.time_at(3000.0)).abs() < 1.0e-9);
        let colors: Vec<[u8; 3]> = (0..256).map(|i| [i as u8, 0, (255 - i) as u8]).collect();
        let ranges = vec![CycleRange {start:254,end:255,rate:1.0,direction:1,offset:0.0}];
        assert_eq!(validated_ranges(&ranges, 256).len(), 1);
        fill_display(&mut display, &colors, &ranges, "classic", 1.0, 1.0);
        assert_eq!((display[254 * 4] * 255.0).round(), 255.0);
        assert_eq!((display[255 * 4] * 255.0).round(), 254.0);
        let overlapping = vec![CycleRange {start:0,end:2,rate:1.0,direction:1,offset:0.0}, CycleRange {start:2,end:3,rate:1.0,direction:1,offset:0.0}];
        assert!(validated_ranges(&overlapping, 256).is_empty());
        assert!(validated_ranges(&ranges, 16).is_empty());
        assert_eq!(Transport::validated(Some(&Transport {to_rate:f64::NAN,..Transport::default()})).to_rate, 0.0);
    }
}
