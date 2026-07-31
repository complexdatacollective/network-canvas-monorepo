#!/usr/bin/env bash

# Resolve the Playwright container's native platform from the Docker daemon,
# not the macOS client process. Docker Desktop on Apple Silicon reports arm64
# here even when the invoking shell is running through Rosetta.
playwright_docker_platform_for_arch() {
  case "$1" in
    arm64 | aarch64)
      PLAYWRIGHT_DOCKER_PLATFORM="linux/arm64"
      PLAYWRIGHT_DOCKER_VOLUME_ARCH="arm64"
      ;;
    amd64 | x86_64)
      PLAYWRIGHT_DOCKER_PLATFORM="linux/amd64"
      PLAYWRIGHT_DOCKER_VOLUME_ARCH="amd64"
      ;;
    *)
      echo "Error: unsupported Docker server architecture '$1'." >&2
      return 1
      ;;
  esac
  export PLAYWRIGHT_DOCKER_PLATFORM PLAYWRIGHT_DOCKER_VOLUME_ARCH
}

detect_playwright_docker_platform() {
  if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker is not running." >&2
    return 1
  fi

  local docker_arch
  docker_arch="$(docker version --format '{{.Server.Arch}}')"
  playwright_docker_platform_for_arch "$docker_arch"
  echo "Playwright Docker platform: ${PLAYWRIGHT_DOCKER_PLATFORM}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  detect_playwright_docker_platform
fi
