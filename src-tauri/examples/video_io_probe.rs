//! Explicit local SDK smoke: cargo run --release --example video_io_probe -- /path/to/libndi
use ascii_vj_remix_lib::video_io::{frame::VideoFrame, ndi};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

fn main() -> Result<(), String> {
    let path = std::env::args()
        .nth(1)
        .ok_or("Pass the staged NDI runtime path")?;
    let api = ndi::Api::load(Path::new(&path))?;
    println!("runtime={}", api.version());
    let mode = std::env::args().nth(2).unwrap_or_else(|| "loopback".into());
    let needle = std::env::args()
        .nth(3)
        .unwrap_or_else(|| "ASCII VJ Remix".into());
    if mode == "receive" {
        let start = Instant::now();
        let mut finder = ndi::Finder::new(api.clone())?;
        let source = loop {
            if let Some(source) = finder
                .sources(500)
                .into_iter()
                .find(|s| s.name.contains(&needle))
            {
                break source;
            }
            if start.elapsed() > Duration::from_secs(30) {
                return Err("Source discovery timed out".into());
            }
        };
        let mut receiver = ndi::Receiver::new(api, &source)?;
        let mut count = 0;
        let mut low = 255;
        let mut high = 0;
        while start.elapsed() < Duration::from_secs(45) {
            if let Some(frame) = receiver.receive(100)? {
                for p in frame.rgba.chunks_exact(4) {
                    low = low.min(p[3]);
                    high = high.max(p[3]);
                }
                count += 1;
                if count == 120 {
                    println!(
                        "PASS: NDI received {count} frames {}x{} alpha={low}..{high}",
                        frame.width, frame.height
                    );
                    return Ok(());
                }
            }
        }
        return Err(format!("Timed out after {count} frames"));
    }
    let mut sender = ndi::Sender::new(api.clone(), "ASCII VJ Remix SDK proof")?;
    let source = sender.source();
    let mut frame = VideoFrame::new(1920, 1080, [30, 90, 180, 128].repeat(1920 * 1080))?;
    // Alpha stripe and an opaque black patch catch accidental flattening/keying.
    for pixel in frame.rgba[..1920 * 4].chunks_exact_mut(4) {
        pixel.copy_from_slice(&[0, 0, 0, 255]);
    }
    for pixel in frame.rgba[(1080 - 64) * 1920 * 4..].chunks_exact_mut(4) {
        pixel[3] = 0;
    }
    if mode == "send" {
        let width = std::env::args()
            .nth(5)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(1920);
        let height = width * 9 / 16;
        frame = VideoFrame::new(
            width,
            height,
            [30, 90, 180, 128].repeat((width * height) as usize),
        )?;
        let seconds = std::env::args()
            .nth(4)
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(300);
        let deadline = Instant::now() + Duration::from_secs(seconds);
        let mut n = 0;
        for (index, pixel) in frame.rgba.chunks_exact_mut(4).enumerate() {
            pixel[3] = if index % (width as usize) < (width / 3) as usize {
                0
            } else if index % (width as usize) < (width * 2 / 3) as usize {
                128
            } else {
                255
            };
        }
        while Instant::now() < deadline {
            frame.rgba[1] = (n % 256) as u8;
            sender.send(&frame);
            n += 1;
            std::thread::sleep(Duration::from_millis(16));
        }
        println!("PASS: NDI sent {n} frames");
        return Ok(());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let send_stop = stop.clone();
    let worker = std::thread::spawn(move || {
        while !send_stop.load(Ordering::Acquire) {
            sender.send(&frame);
            std::thread::sleep(Duration::from_millis(16));
        }
    });
    let result = (|| {
        let mut receiver = ndi::Receiver::new(api, &source)?;
        let start = Instant::now();
        let mut received = 0;
        // Allow SDK connection startup and unoptimized copies on hosted VMs.
        // This is a frame-integrity gate, not a frame-rate benchmark.
        while start.elapsed() < Duration::from_secs(30) {
            if let Some(f) = receiver.receive(100)? {
                if f.width != 1920 || f.height != 1080 {
                    return Err("Incorrect received dimensions".into());
                }
                // NDI is compressed: the Windows SDK rounds the opaque sample
                // to 254. Apply the same two-code tolerance to every alpha band.
                let transparent = f.rgba[(1040 * 1920 + 960) * 4 + 3];
                if f.rgba[3].abs_diff(255) > 2
                    || f.rgba[1920 * 4 + 3].abs_diff(128) > 2
                    || transparent > 2
                    || f.rgba[..3].iter().any(|c| *c > 2)
                {
                    return Err(format!(
                        "Alpha did not survive the NDI connection: top={:?}, next_row={:?}, center={:?}, transparent={transparent}, alpha_range={:?}",
                        &f.rgba[..4],
                        &f.rgba[1920 * 4..1920 * 4 + 4],
                        &f.rgba[(540 * 1920 + 960) * 4..(540 * 1920 + 960) * 4 + 4],
                        f.rgba.chunks_exact(4).fold((255u8, 0u8), |(lo, hi), p| (lo.min(p[3]), hi.max(p[3])))
                    ));
                }
                received += 1;
                if received == 60 {
                    println!("PASS: 60 video frames, 1920x1080, transparent/partial/opaque alpha and black retained within two-code codec tolerance; no audio requested or sent");
                    return Ok(());
                }
            }
        }
        Err(format!("Timed out after {received} frames"))
    })();
    stop.store(true, Ordering::Release);
    worker.join().map_err(|_| "Sender panicked")?;
    result
}
