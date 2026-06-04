#!/usr/bin/env node
// Build the native crate and copy the resulting dylib into a Node-loadable
// `.node` file next to index.cjs.
//
// Skips the build on non-macOS hosts so postinstall on Windows/Linux is a
// no-op (the runtime loader at index.cjs surfaces an "unavailable" stub).
//
// Requires the Rust toolchain (cargo) on macOS hosts. If cargo is missing,
// prints a friendly hint and exits 0 so a fresh checkout without Rust still
// installs cleanly (the loader stub kicks in until the dev installs Rust and
// reruns `pnpm --filter @codaco/biometric-keystore build`).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const crateDir = join(here, '..');

if (process.platform !== 'darwin') {
  console.log(
    `[biometric-keystore] skipping build on ${process.platform} (macOS only)`,
  );
  process.exit(0);
}

const cargoExists = spawnSync('cargo', ['--version'], { stdio: 'ignore' });
if (cargoExists.status !== 0) {
  console.log(
    '[biometric-keystore] cargo not found; skipping native build. Install Rust from https://rustup.rs and rerun `pnpm --filter @codaco/biometric-keystore build`.',
  );
  process.exit(0);
}

const archs = [
  { triple: 'aarch64-apple-darwin', nodeArch: 'arm64' },
  { triple: 'x86_64-apple-darwin', nodeArch: 'x64' },
];

const targetSelf = archs.find((a) => a.nodeArch === process.arch);
if (!targetSelf) {
  console.error(
    `[biometric-keystore] unsupported macOS arch ${process.arch}; expected arm64 or x64`,
  );
  process.exit(1);
}

const result = spawnSync(
  'cargo',
  ['build', '--release', '--target', targetSelf.triple],
  { cwd: crateDir, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const dylib = join(
  crateDir,
  'target',
  targetSelf.triple,
  'release',
  'libbiometric_keystore.dylib',
);
const outNode = join(
  crateDir,
  `biometric-keystore.darwin-${targetSelf.nodeArch}.node`,
);

if (!existsSync(dylib)) {
  console.error(`[biometric-keystore] expected dylib at ${dylib}`);
  process.exit(1);
}
copyFileSync(dylib, outNode);
console.log(`[biometric-keystore] built ${outNode}`);
