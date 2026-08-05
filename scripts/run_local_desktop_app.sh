#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_APP="${ASCILINE_SOURCE_APP:-/private/tmp/ascii-vj-remix-tauri-target/release/bundle/macos/ASCII VJ Remix Dev.app}"
INSTALL_DIR="${ASCILINE_INSTALL_DIR:-$HOME/Applications}"
INSTALL_APP="$INSTALL_DIR/ASCII VJ Remix Dev.app"
APP_ID="com.asciline.remix.dev"
PRODUCTION_APP="/Applications/ASCII VJ Remix.app"
LOCAL_IDENTITY="${ASCILINE_LOCAL_CODESIGN_IDENTITY:-ASCII VJ Remix Local Code Signing}"
CODESIGN_IDENTITY="${ASCILINE_CODESIGN_IDENTITY:-$LOCAL_IDENTITY}"

if [[ "$INSTALL_APP" == "$PRODUCTION_APP" || "$(basename "$INSTALL_APP")" == "ASCII VJ Remix.app" ]]; then
  echo "ASCII VJ Remix local run: refusing to target the production app bundle." >&2
  exit 1
fi

if [[ "$CODESIGN_IDENTITY" == "-" && "${ASCILINE_ALLOW_ADHOC_LOCAL:-0}" != "1" ]]; then
  echo "ASCII VJ Remix local run: ad-hoc signing changes identity on every rebuild." >&2
  echo "Run npm run desktop:codesign:local once, or set ASCILINE_ALLOW_ADHOC_LOCAL=1 for a permission-disposable build." >&2
  exit 1
fi

if [[ "$CODESIGN_IDENTITY" != "-" ]] && ! /usr/bin/security find-identity -v -p codesigning | grep -F "\"$CODESIGN_IDENTITY\"" >/dev/null; then
  echo "ASCII VJ Remix local run: code-signing identity not found: $CODESIGN_IDENTITY" >&2
  echo "Run npm run desktop:codesign:local once, then retry." >&2
  exit 1
fi

if [[ "${1:-}" == "--build" ]]; then
  set +e
  (cd "$ROOT_DIR" && npm run tauri:build:dev -- --bundles app)
  build_status=$?
  set -e
  if [[ "$build_status" -ne 0 && ! -d "$SOURCE_APP" ]]; then
    exit "$build_status"
  fi
  if [[ "$build_status" -ne 0 ]]; then
    echo "ASCILINE local run: release app was produced; continuing after non-fatal bundler exit." >&2
  fi
fi

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "ASCII VJ Remix local run: missing development app at $SOURCE_APP" >&2
  echo "Run: npm run tauri:build:dev -- --bundles app" >&2
  exit 1
fi

SOURCE_APP_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SOURCE_APP/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$SOURCE_APP_ID" != "$APP_ID" ]]; then
  echo "ASCII VJ Remix local run: refusing source bundle id '$SOURCE_APP_ID'; expected '$APP_ID'." >&2
  exit 1
fi

pkill -f '/ASCII VJ Remix Dev.app/Contents/MacOS/ascii-vj-remix|/debug/ascii-vj-remix' 2>/dev/null || true

ENTITLEMENTS="$ROOT_DIR/src-tauri/Entitlements.plist"

install_app() {
  local target_app="$1"
  local target_dir
  target_dir="$(dirname "$target_app")"

  mkdir -p "$target_dir"
  rm -rf "$target_app"
  /usr/bin/ditto "$SOURCE_APP" "$target_app"

  # Local debug bundles can inherit quarantine/provenance metadata from DMG or /private/tmp staging.
  /usr/bin/xattr -cr "$target_app" 2>/dev/null || true

  if [[ -f "$ENTITLEMENTS" ]]; then
    /usr/bin/codesign --force --deep --options runtime --entitlements "$ENTITLEMENTS" --sign "$CODESIGN_IDENTITY" "$target_app"
  else
    /usr/bin/codesign --force --deep --options runtime --sign "$CODESIGN_IDENTITY" "$target_app"
  fi
}

install_app "$INSTALL_APP"

INSTALLED_APP_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INSTALL_APP/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$INSTALLED_APP_ID" != "$APP_ID" ]]; then
  echo "ASCII VJ Remix local run: installed bundle id changed unexpectedly: $INSTALLED_APP_ID" >&2
  exit 1
fi

/usr/bin/codesign --verify --deep --strict --verbose=2 "$INSTALL_APP"
DESIGNATED_REQUIREMENT="$(/usr/bin/codesign -dr - "$INSTALL_APP" 2>&1)"
if [[ "$CODESIGN_IDENTITY" != "-" && "$DESIGNATED_REQUIREMENT" == *"cdhash H\""* ]]; then
  echo "ASCII VJ Remix local run: stable signing produced a code-hash-only identity; refusing to launch." >&2
  exit 1
fi

if [[ "${ASCILINE_RESET_TCC:-0}" == "1" ]]; then
  /usr/bin/tccutil reset Camera "$APP_ID" || true
  /usr/bin/tccutil reset Microphone "$APP_ID" || true
fi

echo "ASCII VJ Remix local run: $INSTALL_APP"
echo "ASCII VJ Remix local run: bundle id $APP_ID"
echo "ASCII VJ Remix local run: codesign identity $CODESIGN_IDENTITY"
if [[ "${ASCILINE_FOREGROUND:-0}" == "1" ]]; then
  exec "$INSTALL_APP/Contents/MacOS/ascii-vj-remix"
fi

/usr/bin/open -n "$INSTALL_APP"
