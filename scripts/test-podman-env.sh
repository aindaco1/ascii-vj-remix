#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# Fake CLI permits health probes only: lifecycle mutations fail the regression.
podman() {
  case "$*" in
    --version) return 0 ;;
    info) return "${TEST_INFO_STATUS:-0}" ;;
    'info --format {{.Host.Security.Rootless}}') echo true ;;
    *) echo "Unexpected Podman mutation: $*" >&2; return 99 ;;
  esac
}
export -f podman
export CONTAINER_HOST=unix:///tmp/user-selected.sock
export ASCILINE_PODMAN_MACHINE=ignored-fallback
source "$root/scripts/podman_env.sh"
ensure_podman_ready
[[ "$CONTAINER_HOST" == unix:///tmp/user-selected.sock ]]
[[ -z "${CONTAINER_CONNECTION:-}" ]]
if (TEST_INFO_STATUS=1 ensure_podman_ready) 2>/dev/null; then
  echo 'Expected unreachable engine to fail without restarting it' >&2
  exit 1
fi
echo 'Podman endpoint and non-disruptive failure tests passed'
