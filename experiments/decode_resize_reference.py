import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ascii_video_player2 import AsciiMapper, VideoDecoder


def write_outputs(video: Path, out: Path, width: int, height: int, frames: int) -> None:
    out.mkdir(parents=True, exist_ok=True)
    decoder = VideoDecoder(os.fspath(video), width, height, skip_gray=False)
    mapper = AsciiMapper()
    palette = np.frombuffer("".join(mapper._lut.tolist()).encode("ascii"), dtype=np.uint8)
    rgb_chunks = []
    pixel_chunks = []
    ascii_chunks = []

    try:
        for idx, (gray, bgr) in enumerate(decoder):
            if idx >= frames:
                break

            rgb = np.ascontiguousarray(bgr[:, :, ::-1])
            indices = np.floor_divide(gray, max(1, 256 // mapper._n))
            np.clip(indices, 0, mapper._n - 1, out=indices)

            ascii_frame = np.empty((height, width, 4), dtype=np.uint8)
            ascii_frame[:, :, 0] = palette[indices]
            ascii_frame[:, :, 1:] = rgb

            rgb_chunks.append(rgb.tobytes())
            pixel_chunks.append(np.ascontiguousarray(bgr).tobytes())
            ascii_chunks.append(np.ascontiguousarray(ascii_frame).tobytes())
    finally:
        decoder.release()

    (out / "rgb.bin").write_bytes(b"".join(rgb_chunks))
    (out / "pixel.bin").write_bytes(b"".join(pixel_chunks))
    (out / "ascii_m5.bin").write_bytes(b"".join(ascii_chunks))
    (out / "meta.json").write_text(
        json.dumps(
            {
                "generator": "python-opencv",
                "video": os.fspath(video),
                "width": width,
                "height": height,
                "requestedFrames": frames,
                "frames": len(rgb_chunks),
                "rgbFrameBytes": width * height * 3,
                "asciiFrameBytes": width * height * 4,
                "sourceFps": decoder.fps,
                "sourceWidth": decoder.vid_w,
                "sourceHeight": decoder.vid_h,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Python/OpenCV decode-resize reference fixtures.")
    parser.add_argument("--video", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--width", type=int, default=96)
    parser.add_argument("--height", type=int, default=54)
    parser.add_argument("--frames", type=int, default=12)
    args = parser.parse_args()

    if args.width <= 0 or args.height <= 0 or args.frames <= 0:
        raise SystemExit("width, height, and frames must be greater than zero")

    write_outputs(Path(args.video), Path(args.out), args.width, args.height, args.frames)
    print(os.fspath(Path(args.out)))


if __name__ == "__main__":
    main()
