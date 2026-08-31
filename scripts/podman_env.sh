#!/usr/bin/env bash

ASCILINE_PODMAN_MACHINE="${ASCILINE_PODMAN_MACHINE:-podman-machine-default}"

prefer_podman_path() {
  local candidate=""
  for candidate in \
    "/opt/podman/bin" \
    "/usr/local/podman/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"
  do
    if [ -x "$candidate/podman" ]; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done
  return 1
}

detect_os_family() {
  case "$(uname -s)" in
    Darwin)
      echo "macos"
      ;;
    Linux)
      echo "linux"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "windows"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

detect_podman_socket() {
  podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' "$ASCILINE_PODMAN_MACHINE" 2>/dev/null || true
}

configure_podman_connection() {
  local socket_path="${1:-}"

  if [ -z "$socket_path" ]; then
    socket_path="$(detect_podman_socket)"
  fi

  if [ -n "$socket_path" ]; then
    unset CONTAINER_CONNECTION
    export CONTAINER_HOST="unix://${socket_path}"
  fi
}

podman_machine_log_path() {
  local socket_path=""
  socket_path="$(detect_podman_socket)"
  if [ -n "$socket_path" ]; then
    echo "$(dirname "$socket_path")/${ASCILINE_PODMAN_MACHINE}.log"
  fi
}

podman_env_fail() {
  printf 'podman: %s\n' "$1" >&2
  exit 1
}

podman_env_warn() {
  printf 'podman: %s\n' "$1" >&2
}

ensure_podman_ready() {
  local run_smoke="${1:-false}"
  local os_family=""
  local machine_state=""
  local configured_machine="false"
  local log_path=""
  local rootless=""

  prefer_podman_path || true

  if ! command -v podman >/dev/null 2>&1; then
    podman_env_fail "Podman is not on PATH. Install Podman, then retry."
  fi

  os_family="$(detect_os_family)"

  if ! podman --version >/dev/null 2>&1; then
    podman_env_fail "Podman CLI is installed but not responding."
  fi

  if [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; then
    # A healthy default connection may point at a machine owned by another
    # checkout. Reuse it before trying to start this repo's fallback machine;
    # macOS providers allow only one VM to run at a time.
    if ! podman info >/dev/null 2>&1; then
      if ! podman machine inspect "$ASCILINE_PODMAN_MACHINE" >/dev/null 2>&1; then
        podman_env_fail "No reachable Podman engine and machine '$ASCILINE_PODMAN_MACHINE' was not found. Run: podman machine init --now"
      fi

      machine_state="$(podman machine inspect --format '{{.State}}' "$ASCILINE_PODMAN_MACHINE" 2>/dev/null || true)"
      if [ "$machine_state" != "running" ]; then
        podman_env_warn "Podman engine is not reachable; starting $ASCILINE_PODMAN_MACHINE."
        podman machine start "$ASCILINE_PODMAN_MACHINE" >/tmp/ascii-vj-remix-podman-start.log 2>&1 || true
        machine_state="$(podman machine inspect --format '{{.State}}' "$ASCILINE_PODMAN_MACHINE" 2>/dev/null || true)"
        if [ "$machine_state" != "running" ]; then
          log_path="$(podman_machine_log_path)"
          [ -f /tmp/ascii-vj-remix-podman-start.log ] && printf 'podman: start log: /tmp/ascii-vj-remix-podman-start.log\n' >&2
          [ -n "$log_path" ] && [ -f "$log_path" ] && printf 'podman: machine log: %s\n' "$log_path" >&2
          podman_env_fail "Podman machine did not stay running after startup."
        fi
      fi

      configure_podman_connection
      configured_machine="true"
    fi
  fi

  if ! podman info >/dev/null 2>&1; then
    if [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; then
      podman_env_warn "Podman API is stale; restarting $ASCILINE_PODMAN_MACHINE once."
      podman machine stop "$ASCILINE_PODMAN_MACHINE" >/tmp/ascii-vj-remix-podman-stop.log 2>&1 || true
      podman machine start "$ASCILINE_PODMAN_MACHINE" >/tmp/ascii-vj-remix-podman-start.log 2>&1 || true
      configure_podman_connection
      configured_machine="true"
    fi
  fi

  if ! podman info >/dev/null 2>&1; then
    podman_env_fail "Podman engine is not reachable. Try: podman machine stop && podman machine start"
  fi

  if [ "$os_family" = "macos" ] || [ "$os_family" = "windows" ]; then
    for _ in 1 2 3; do
      if [ "$configured_machine" = "true" ]; then
        configure_podman_connection
      fi
      if ! podman info >/dev/null 2>&1; then
        log_path="$(podman_machine_log_path)"
        [ -n "$log_path" ] && [ -f "$log_path" ] && printf 'podman: machine log: %s\n' "$log_path" >&2
        podman_env_fail "Podman machine is not staying reachable after startup."
      fi
      sleep 1
    done
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
