# Development VM

A Linux virtual machine on Apple's Virtualization.framework that holds the
repository, the toolchain and every process a developer or an agent spawns.
It exists because managed Macs run endpoint-security agents (CrowdStrike
Falcon, CyberArk EPM) that do work on **every process launch and file open**
on the host — roughly 11 ms per launch, most of it in `opendirectoryd` — and an
agent fleet running turbo, vitest and git launches 10–20 processes a second.
Inside the VM the same launches cost ~0.3 ms and the host agents see nothing:
to them the VM is one process holding one open disk image.

The configuration lives entirely in this directory:

| File                  | Role                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `vm`                  | Host-side driver: `up`, `bootstrap`, `shell`, `sync-claude`, `rebuild`… |
| `lima.yaml`           | The VM: 12 vCPUs, 32 GiB, ASIF OS disk, **no host mounts**, data disk   |
| `provision/system.sh` | Root provisioning: data-disk layout, Docker, `gh`, build tools, sysctls |
| `provision/user.sh`   | User provisioning: mise, pnpm store location, Claude Code, tmux         |
| `bootstrap.sh`        | Guest-side: clone the repo, Node + pnpm from the repo's pins, deps      |

## Measured

Same commit, same Node 24.18.0, `VITEST_MAX_WORKERS=8`, run back to back on
an M5 Max (18 cores, 64 GiB) on 2026-09-11 while other agent sessions kept
the host's load average at 40–60 — indicative, not a controlled benchmark.
Each cell is the range over two runs.

| Workload                                | Host (macOS) | Guest (12 vCPU) |
| --------------------------------------- | ------------ | --------------- |
| `git status`                            | 0.2–0.8 s    | 0.04–0.6 s      |
| `protocol-validation` vitest (59 files) | 55–88 s      | 13–15 s         |
| `interview` unit vitest (197 files)     | 69–174 s     | 42–50 s         |
| `interview` `tsc --build --force`       | 5.6–13.4 s   | 3.0–5.0 s       |
| 1 process launch (`/bin/true` loop)     | ~11 ms       | ~0.3 ms         |

The guest is also far more consistent: the host's second run of each suite
was slower than its first as the security agents' backlog grew.

## Prerequisites

- macOS 26 or later on Apple silicon (ASIF disk images need macOS 26).
- [Lima](https://lima-vm.io) ≥ 2.2: `brew install lima`.
- `gh` signed in on the host (optional — its token is copied into the guest).

## First run

```sh
dev-vm/vm up          # creates the 400 GiB sparse data disk, downloads Ubuntu 26.04, provisions
dev-vm/vm bootstrap   # clones the repo, installs Node/pnpm/deps/Playwright, signs gh in
dev-vm/vm sync-claude # copies ~/.claude settings, skills and this repo's memory into the guest
dev-vm/vm shell       # you are now in the VM, in the same directory you were in on the host
```

`up` takes a few minutes the first time (image download and package
installation); later starts take seconds. `bootstrap` is idempotent and safe
to re-run after pulling changes to `.nvmrc`, `packageManager` or the lockfile.

Add this as the **first line** of `~/.ssh/config` (an `Include` placed after a
`Host` block only applies to that host) and the VM is `ssh lima-nc` for VS Code
Remote-SSH, rsync and anything else that speaks SSH:

```
Include ~/.lima/nc/ssh.config
```

## Daily use

- `dev-vm/vm shell` opens a login shell. Run `tmux` there: sessions survive a
  closed terminal, a dropped connection and the Mac sleeping, so a fleet of
  agents keeps running and you reattach with `tmux attach`.
- The repository is at the **same path as on the host**
  (`/Users/<you>/Projects/network-canvas-monorepo`); the guest home directory
  is `/Users/<you>` too. `dev-vm/vm shell` lands in the guest copy of whatever
  directory you ran it from, when that directory exists in the guest.
- Every port the guest listens on is forwarded to `localhost` on the Mac, so
  `pnpm --filter @codaco/architect dev` is at <http://localhost:5173> in your
  browser as usual. The host is reachable from the guest as `host.lima.internal`.
- Docker runs inside the guest (rootful `docker-ce`, the user is in the
  `docker` group). Docker Desktop on the Mac is no longer needed for this repo.
- `dev-vm/vm stop` when you want the memory back; `dev-vm/vm up` resumes.
- After a Mac reboot, run `dev-vm/vm up` again (or add it to your login items).

## Claude Code in the VM

Run `claude` inside the guest (`dev-vm/vm shell`, then `tmux`, then `claude`).
Everything it spawns — Bash tool calls, the repo's agent hooks, turbo, vitest,
git — runs in the guest. Notes:

- **Sign in once**: `claude` prints a login URL; open it in the Mac's browser
  and paste the code back. The auth state lives in the guest home, which is
  on the data disk, so it survives rebuilds.
- **Settings, skills and memory**: `dev-vm/vm sync-claude` copies
  `~/.claude/settings.json`, `CLAUDE.md`, `skills/`, `agents/`, `hooks/` and
  this repository's `projects/<slug>/memory/` from the host. Because the
  repository path is mirrored, the project slug matches and memory carries
  over unchanged. Re-run it whenever the host copy changes; it overwrites.
- **Worktrees** (`EnterWorktree`, `git worktree add`) work as on the host; they
  are directories on the same ext4 filesystem.
- **Browser tools**: the Claude-in-Chrome MCP bridge connects the CLI to Chrome
  through a native helper on the Mac, so a guest-side `claude` does not have
  it. Use headless Playwright in the guest for verification (already the
  preferred route in this repo), and a host-side `claude` for the sessions
  that need the extension. Dev servers are reachable from the Mac's Chrome
  through the forwarded ports either way.
- **Autonomy**: the VM is a natural place for `--dangerously-skip-permissions`
  fleets — the blast radius is a rebuildable guest. It still holds your git
  and `gh` credentials (and the forwarded ssh-agent), so treat that as scoped
  to the VM, not to your accounts.
- **VS Code**: Remote-SSH to `lima-nc` runs the VS Code server (and its file
  watcher) in the guest; the Claude Code extension then runs the CLI remotely.

## Rebuilding and upgrading

```sh
dev-vm/vm rebuild   # delete the OS disk, recreate from lima.yaml; data disk kept
```

Use it after editing `lima.yaml` or anything in `provision/` (they are copied
into the instance at creation time), after a Lima upgrade, or whenever the OS
disk feels stale. Two rules for the provisioning scripts: they run on **every
boot**, so each step must be idempotent; and Lima processes them as Go
templates (that is how `{{.User}}` and `{{.Home}}` get filled in), so they must
not contain any other literal `{{` — and they must not source Lima's
`lima.env`, whose values are unquoted. It takes a few minutes and loses nothing: the home directory
(credentials, Claude Code state, mise toolchains, shell history), every
repository and worktree, and the pnpm store are all on the data disk.

Per-project toolchain changes need no rebuild at all — `bootstrap` (or plain
`mise install` and `corepack install` in the repo) picks up new `.nvmrc` and
`packageManager` pins.

`dev-vm/vm destroy` deletes the data disk as well; it asks you to type the
disk name first.

## What is on the data disk

Lima mounts the raw disk `nc-data` at `/mnt/lima-nc-data` (ext4, `noatime`,
`discard`). `provision/system.sh` lays it out on every boot:

```
/mnt/lima-nc-data/
  home/<you>/     bind-mounted over /Users/<you>   (seeded from the first boot's home)
  pnpm-store/     pnpm's content-addressable store  (same filesystem → hard links)
```

The repository lives in `/Users/<you>/Projects/` inside that home.

## Design notes

**No host mounts.** Any host directory shared into the guest (virtiofs, 9p,
Docker bind mount) is served by a host-side process that opens each file —
the security agents see all of it again, and the path is slower than the
guest's own filesystem. Editor and shell access go the other way, over SSH.
Lima's [guide to running AI agents](https://lima-vm.io/docs/examples/ai/)
defaults to mounting the project (its goal is isolating the agent from the
rest of the host); the variant it calls `--mount-none` is the one this VM is
built on, with a persistent clone in place of per-invocation `--sync`.

**Where the I/O goes.** Guest ext4 → virtio-blk → one image file on APFS.
Small-file metadata work (`git status`, `node_modules` resolution, vitest's
fork-per-file) never leaves the guest kernel and its page cache, which is why
a Linux guest routinely beats native APFS at it even before subtracting the
security agents. The OS disk is ASIF, Apple's sparse VM image format; the data
disk is raw because Lima only supports ASIF for the primary disk. `vm up`
excludes both images from Time Machine.

**CPU topology.** Virtualization.framework exposes a flat set of identical
vCPUs; there is no way to tell the guest about performance and efficiency
cores, and no way to pin vCPU threads (Apple silicon has no thread-affinity
API). macOS schedules busy vCPU threads onto performance cores itself. The VM
asks for 12 vCPUs — the performance-core count — so the guest never sizes work
against efficiency cores it thinks are full cores. Change `cpus`/`memory` in
`lima.yaml` and `rebuild` if your machine differs.

**Mirrored paths.** The guest user, uid and home directory path match the
host's, so absolute paths in configuration, Claude Code's per-project state
(keyed by repository path) and `limactl shell`'s "same directory" behaviour
all work without translation.

**Reproducibility.** `lima.yaml` + `provision/` yield the same machine every
time; the toolchain versions come from the repository's own pins (`.nvmrc`,
`packageManager`, the lockfile), so there is a single source of truth and a
version bump is a normal PR. System packages (`docker-ce`, `gh`) install from
their upstream apt repositories at provisioning time.

## Troubleshooting

- **Provisioning failed**: `dev-vm/vm shell -- sudo cat /var/log/cloud-init-output.log`.
  Fix the script, then `dev-vm/vm rebuild`.
- **`permission denied … docker.sock`**: the session predates the `docker`
  group grant (Lima's multiplexed ssh connection was opened before
  provisioning finished). `vm up` drops that connection after a first boot;
  if it still happens, `ssh -O exit lima-nc`, then open a new shell (or
  `newgrp docker` in the current one).
- **`missing or unsuitable terminal: xterm-ghostty`** (or another terminal
  the guest's ncurses does not know): `dev-vm/vm bootstrap` copies the host's
  `$TERM` entry in; by hand it is
  `infocmp -x "$TERM" | ssh lima-nc 'tic -x -'`.
- **Ports not forwarded**: Lima forwards ports bound on `127.0.0.1` or
  `0.0.0.0` inside the guest; a server bound only to the guest's LAN IP is not
  forwarded.
- **Host `git` in the mirrored path**: the host still has its own checkout at
  the same path — the two are independent clones. Push from one, pull in the
  other.
- **Lima state**: `~/.lima/nc/` (instance), `~/.lima/_disks/nc-data/` (data
  disk), `~/.lima/nc/serial*.log` (console).
