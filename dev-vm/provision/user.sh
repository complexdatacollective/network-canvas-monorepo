#!/bin/bash
# User-level provisioning for the Network Canvas dev VM (runs as the user).
#
# Runs on every boot; every step is idempotent. Because the home directory is
# on the data disk, everything installed here survives `dev-vm/vm rebuild`.
set -eux -o pipefail

DATA=/mnt/lima-nc-data
export PATH="$HOME/.local/bin:$PATH"

# --- mise: per-project toolchain versions ----------------------------------
# Node comes from the repository's .nvmrc; pnpm from its `packageManager` field
# (through corepack, set up by dev-vm/bootstrap.sh).
if [ ! -x "$HOME/.local/bin/mise" ]; then
  curl -fsSL https://mise.run | sh
fi
install -d "$HOME/.config/mise"
cat > "$HOME/.config/mise/config.toml" <<'EOF'
[settings]
idiomatic_version_file_enable_tools = ["node"]
EOF
if ! grep -q 'mise activate bash' "$HOME/.bashrc"; then
  printf '\neval "$(%s/.local/bin/mise activate bash)"\n' '$HOME' >> "$HOME/.bashrc"
fi
# Non-interactive ssh commands (`ssh lima-nc node …`, VS Code Remote-SSH, CI-style
# scripts) run bash without a login and Ubuntu's ~/.bashrc returns before any
# user lines for non-interactive shells, so the shims go on the FIRST line of
# ~/.bashrc; ~/.profile (login shells) sources ~/.bashrc itself.
if ! grep -q 'mise/shims' "$HOME/.bashrc"; then
  sed -i '1i export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"' "$HOME/.bashrc"
fi

# --- pnpm: content-addressable store on the data disk -----------------------
# Same filesystem as the repositories, so pnpm can hard-link instead of copy.
if ! grep -q '^store-dir=' "$HOME/.npmrc" 2>/dev/null; then
  echo "store-dir=$DATA/pnpm-store" >> "$HOME/.npmrc"
fi

# --- Claude Code (native installer) ----------------------------------------
if [ ! -x "$HOME/.local/bin/claude" ]; then
  curl -fsSL https://claude.ai/install.sh | bash
fi

# --- tmux: sessions that outlive the terminal -------------------------------
if [ ! -f "$HOME/.tmux.conf" ]; then
  cat > "$HOME/.tmux.conf" <<'EOF'
set -g mouse on
set -g history-limit 50000
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*:Tc"
EOF
fi
