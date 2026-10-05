#!/bin/bash
# System-level provisioning for the Network Canvas dev VM (runs as root).
#
# Lima runs this on every boot, so every step must be idempotent. The first
# boot installs packages and moves the user's home onto the data disk; later
# boots only re-establish the bind mounts.
set -eux -o pipefail
export DEBIAN_FRONTEND=noninteractive

# Lima processes provisioning scripts as Go templates when the instance is
# created and substitutes these. No other double-brace sequence may appear
# anywhere in the script, comments included.
USER_NAME="{{.User}}"
USER_HOME="{{.Home}}"
getent passwd "$USER_NAME" >/dev/null

DATA=/mnt/lima-nc-data
PERSISTENT_HOME="$DATA/home/$USER_NAME"

# ---------------------------------------------------------------------------
# Data disk: mount options and layout
# ---------------------------------------------------------------------------
mountpoint -q "$DATA"
mount -o remount,noatime,discard "$DATA"

# The whole home directory lives on the data disk so that credentials, Claude
# Code state, mise toolchains and shell history survive `dev-vm/vm rebuild`.
# The first boot seeds it from the home cloud-init just created.
if [ ! -d "$PERSISTENT_HOME" ]; then
  install -d -m 0755 "$DATA/home"
  cp -a "$USER_HOME" "$PERSISTENT_HOME"
fi
install -d -m 0755 "$USER_HOME"
mountpoint -q "$USER_HOME" || mount --bind "$PERSISTENT_HOME" "$USER_HOME"

install -d -m 0755 -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/Projects" "$DATA/pnpm-store"

# ---------------------------------------------------------------------------
# Kernel limits for many watchers and many workers
# ---------------------------------------------------------------------------
cat > /etc/sysctl.d/90-dev-vm.conf <<'EOF'
fs.inotify.max_user_watches = 1048576
fs.inotify.max_user_instances = 8192
fs.file-max = 2097152
vm.swappiness = 10
EOF
sysctl --system >/dev/null

cat > /etc/security/limits.d/90-dev-vm.conf <<'EOF'
* soft nofile 1048576
* hard nofile 1048576
EOF

# ---------------------------------------------------------------------------
# Packages: Docker (docker-ce), GitHub CLI, build tools
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  install -d -m 0755 /etc/apt/keyrings
  arch="$(dpkg --print-architecture)"
  # shellcheck disable=SC1091
  . /etc/os-release

  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  # Docker publishes a suite for each Ubuntu release a little after it ships;
  # fall back to the previous LTS suite until this release has one.
  docker_suite="$VERSION_CODENAME"
  if ! curl -fsSIL "https://download.docker.com/linux/ubuntu/dists/$docker_suite/Release" >/dev/null 2>&1; then
    docker_suite=noble
  fi
  echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $docker_suite stable" \
    > /etc/apt/sources.list.d/docker.list

  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$arch signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list

  apt-get update
  apt-get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    gh git git-lfs \
    build-essential pkg-config python3 \
    tmux htop jq unzip zip rsync curl ca-certificates gnupg xz-utils \
    fonts-liberation fonts-noto-color-emoji
  apt-get clean

  systemctl enable --now docker
  usermod -aG docker "$USER_NAME"
fi
