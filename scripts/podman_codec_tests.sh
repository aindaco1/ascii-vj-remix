#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/scripts/podman_run.sh" bash -c '
  set -euo pipefail
  bash experiments/make_test_clips.sh
  python experiments/gen_vectors.py
  node experiments/check_vectors.js experiments/vectors
  if command -v cargo >/dev/null 2>&1; then
    node scripts/cargo_env.mjs run --manifest-path src-tauri/Cargo.toml --example check_codec_vectors -- experiments/vectors
  else
    echo "skipping Rust vector check: cargo is not installed in the Podman codec image"
  fi
'
