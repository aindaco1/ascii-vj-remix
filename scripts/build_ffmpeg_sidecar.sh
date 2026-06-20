#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${ASCILINE_FFMPEG_VERSION:-8.1.2}"
SHA256="${ASCILINE_FFMPEG_SHA256:-464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c}"
SOURCE_URL="${ASCILINE_FFMPEG_URL:-https://ffmpeg.org/releases/ffmpeg-${VERSION}.tar.xz}"
LICENSE="${ASCILINE_FFMPEG_LICENSE:-LGPL-2.1-or-later}"
VARIANT="${ASCILINE_FFMPEG_VARIANT:-source-lgpl-static-libs}"
WORK_DIR="${ASCILINE_FFMPEG_BUILD_DIR:-${RUNNER_TEMP:-/tmp}/asciline-ffmpeg-${VERSION}}"
SOURCE_PARENT="$WORK_DIR/source"
SOURCE_DIR="$SOURCE_PARENT/ffmpeg-$VERSION"
PREFIX="${ASCILINE_FFMPEG_PREFIX:-$WORK_DIR/install}"
TARBALL="$WORK_DIR/ffmpeg-$VERSION.tar.xz"
PRINT_CONFIG=0

if [ "${1:-}" = "--print-config" ]; then
  PRINT_CONFIG=1
  shift
fi

if [ "$#" -ne 0 ]; then
  printf "Usage: npm run ffmpeg:build-sidecar [-- --print-config]\n" >&2
  exit 1
fi

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) EXE_SUFFIX=".exe" ;;
  *) EXE_SUFFIX="" ;;
esac

CONFIG_FLAGS=(
  "--prefix=$PREFIX"
  "--disable-shared"
  "--enable-static"
  "--disable-doc"
  "--disable-debug"
  "--disable-ffplay"
  "--disable-network"
  "--disable-autodetect"
)

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    CONFIG_FLAGS+=("--target-os=mingw32" "--extra-ldflags=-static")
    ;;
esac

if [ "${ASCILINE_FFMPEG_DISABLE_X86ASM:-0}" = "1" ] || ! command -v nasm >/dev/null 2>&1; then
  CONFIG_FLAGS+=("--disable-x86asm")
fi

SOURCE_NOTE="Official FFmpeg ${VERSION} source release (${SOURCE_URL}) built by scripts/build_ffmpeg_sidecar.sh with LGPL-compatible flags, static FFmpeg libraries, and network protocols disabled."

if [ "$PRINT_CONFIG" -eq 1 ]; then
  printf "version=%s\n" "$VERSION"
  printf "sha256=%s\n" "$SHA256"
  printf "url=%s\n" "$SOURCE_URL"
  printf "license=%s\n" "$LICENSE"
  printf "variant=%s\n" "$VARIANT"
  printf "source=%s\n" "$SOURCE_NOTE"
  printf "flags=%s\n" "${CONFIG_FLAGS[*]}"
  exit 0
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

cpu_jobs() {
  if [ -n "${ASCILINE_FFMPEG_JOBS:-}" ]; then
    printf "%s\n" "$ASCILINE_FFMPEG_JOBS"
  elif command -v nproc >/dev/null 2>&1; then
    nproc
  elif command -v sysctl >/dev/null 2>&1; then
    sysctl -n hw.ncpu
  else
    printf "2\n"
  fi
}

mkdir -p "$WORK_DIR" "$SOURCE_PARENT"

if [ ! -f "$TARBALL" ]; then
  curl -L "$SOURCE_URL" -o "$TARBALL"
fi

ACTUAL_SHA256="$(hash_file "$TARBALL")"
if [ "$ACTUAL_SHA256" != "$SHA256" ]; then
  printf "FFmpeg source hash mismatch for %s\nexpected %s\nactual   %s\n" "$TARBALL" "$SHA256" "$ACTUAL_SHA256" >&2
  exit 1
fi

rm -rf "$SOURCE_DIR" "$PREFIX"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) tar --force-local -xf "$TARBALL" -C "$SOURCE_PARENT" ;;
  *) tar -xf "$TARBALL" -C "$SOURCE_PARENT" ;;
esac

(
  cd "$SOURCE_DIR"
  ./configure "${CONFIG_FLAGS[@]}"
  make -j "$(cpu_jobs)"
  make install
)

node "$ROOT/scripts/stage_ffmpeg_sidecars.mjs" \
  --ffmpeg "$PREFIX/bin/ffmpeg$EXE_SUFFIX" \
  --ffprobe "$PREFIX/bin/ffprobe$EXE_SUFFIX" \
  --license "$LICENSE" \
  --source "$SOURCE_NOTE" \
  --variant "$VARIANT"
