#!/usr/bin/env bash

# Legacy explicit override is a connection name; otherwise use Podman's default.
if [ -n "${ASCILINE_PODMAN_MACHINE:-}" ] && [ -z "${CONTAINER_HOST:-}${CONTAINER_CONNECTION:-}" ]; then
  export CONTAINER_CONNECTION="$ASCILINE_PODMAN_MACHINE"
fi

prefer_podman_path() {
  command -v podman >/dev/null 2>&1 && return 0
  local candidate=""
  for candidate in \
    "/opt/homebrew/bin" \
    "/opt/podman/bin" \
    "/usr/local/podman/bin" \
    "/usr/local/bin"
  do
    if [ -x "$candidate/podman" ]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

podman_env_fail() {
  printf 'podman: %s\n' "$1" >&2
  exit 1
}

ensure_podman_ready() {
  local run_smoke="${1:-false}"
  local rootless=""

  prefer_podman_path || true

  if ! command -v podman >/dev/null 2>&1; then
    podman_env_fail "Podman is not on PATH. Install Podman, then retry."
  fi

  if ! podman --version >/dev/null 2>&1; then
    podman_env_fail "Podman CLI is installed but not responding."
  fi

  if ! podman info >/dev/null 2>&1; then
    podman_env_fail "Selected Podman engine is unreachable. Check 'podman system connection list' and start its machine explicitly if stopped. Shared VMs are never restarted by this project."
  fi

  rootless="$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null || echo false)"
  if [ "$rootless" != "true" ]; then
    podman_env_fail "Podman is not running rootless. This repo expects a rootless local setup."
  fi

  if [ "$run_smoke" = "true" ]; then
    if ! podman run --rm docker.io/library/alpine:3.20 echo ok >/tmp/ascii-vj-remix-podman-alpine.log 2>&1; then
      cat /tmp/ascii-vj-remix-podman-alpine.log >&2 || true
      podman_env_fail "Podman could not run a simple container."
    fi
  fi
}
