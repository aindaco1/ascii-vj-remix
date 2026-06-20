import argparse
import json
import os
from pathlib import Path

import cv2
import numpy as np

PALETTE = np.array(
    list(" `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@"),
    dtype="U1",
)
PALETTE_BYTES = np.frombuffer("".join(PALETTE.tolist()).encode("ascii"), dtype=np.uint8)


def deterministic_rgb(width: int, height: int) -> np.ndarray:
    y, x = np.mgrid[0:height, 0:width]
    rgb = np.empty((height, width, 3), dtype=np.uint8)
    rgb[:, :, 0] = (x * 37 + y * 17 + 13) % 256
    rgb[:, :, 1] = (x * 19 + y * 53 + 97) % 256
    rgb[:, :, 2] = (x * 71 + y * 29 + 211) % 256

    # Pin edge values so palette and quantization boundaries are exercised.
    rgb[0, 0] = [0, 0, 0]
    rgb[0, min(1, width - 1)] = [255, 255, 255]
    rgb[height - 1, width - 1] = [255, 129, 3]
    return rgb


def char_codes_from_rgb(rgb: np.ndarray) -> np.ndarray:
    bgr = rgb[:, :, ::-1]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    step = max(1, 256 // len(PALETTE_BYTES))
    indices = np.floor_divide(gray, step)
    np.clip(indices, 0, len(PALETTE_BYTES) - 1, out=indices)
    return PALETTE_BYTES[indices]


def ascii_color(rgb: np.ndarray, mode: int) -> bytes:
    quantize_bits = {5: 0, 4: 2, 3: 3, 2: 5}[mode]
    color = rgb
    if quantize_bits:
        color = (color >> quantize_bits) << quantize_bits

    frame = np.empty((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    frame[:, :, 0] = char_codes_from_rgb(rgb)
    frame[:, :, 1:] = color
    return np.ascontiguousarray(frame).tobytes()


def text_frame(rgb: np.ndarray) -> str:
    chars = char_codes_from_rgb(rgb)
    return "\n".join("".join(chr(int(value)) for value in row) for row in chars)


def write_outputs(out: Path, width: int, height: int) -> None:
    out.mkdir(parents=True, exist_ok=True)
    rgb = deterministic_rgb(width, height)
    (out / "input.rgb").write_bytes(np.ascontiguousarray(rgb).tobytes())
    (out / "pixel.bin").write_bytes(np.ascontiguousarray(rgb[:, :, ::-1]).tobytes())
    (out / "text.txt").write_text(text_frame(rgb), encoding="utf-8")

    for mode in (2, 3, 4, 5):
        (out / f"ascii_m{mode}.bin").write_bytes(ascii_color(rgb, mode))

    (out / "meta.json").write_text(
        json.dumps(
            {
                "width": width,
                "height": height,
                "paletteLength": int(len(PALETTE_BYTES)),
                "generator": "python-opencv",
                "opencvVersion": cv2.__version__,
                "numpyVersion": np.__version__,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Python/OpenCV frame-prep reference fixtures.")
    parser.add_argument("--out", required=True, help="Output directory.")
    parser.add_argument("--width", type=int, default=17)
    parser.add_argument("--height", type=int, default=11)
    args = parser.parse_args()

    if args.width <= 1 or args.height <= 1:
        raise SystemExit("width and height must be greater than 1")

    write_outputs(Path(args.out), args.width, args.height)
    print(os.fspath(Path(args.out)))


if __name__ == "__main__":
    main()
