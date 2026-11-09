#!/usr/bin/env bash
set -euo pipefail

launcher=$(realpath "$1")
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
appdir="$fixture/App Dir"
mkdir -p "$appdir/usr/bin" "$appdir/usr/lib/webkit2gtk-4.1" "$fixture/elsewhere"
cp "$launcher" "$appdir/AppRun"
chmod +x "$appdir/AppRun"
printf '[Desktop Entry]\nExec=launcher-probe\n' > "$appdir/probe.desktop"
printf 'helper\n' > "$appdir/usr/lib/webkit2gtk-4.1/WebKitNetworkProcess"
cat > "$appdir/usr/bin/launcher-probe" <<'SH'
#!/bin/sh
set -eu
test "$(cat ././/lib/webkit2gtk-4.1/WebKitNetworkProcess)" = helper
test "$#" -eq 2
test "$1" = 'argument with spaces'
test "$2" = '--probe'
printf 'AppRun helper lookup and arguments passed.\n'
SH
chmod +x "$appdir/usr/bin/launcher-probe"
cd "$fixture/elsewhere"
"$appdir/AppRun" 'argument with spaces' --probe
