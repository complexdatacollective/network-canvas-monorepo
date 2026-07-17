#!/usr/bin/env node
// Release-lane safety net for the source-first migration: internal consumers
// read each package's `src`, while npm tarballs must ship `dist` via pnpm's
// publishConfig field-swap (pnpm rewrites exports/main/module/types from
// publishConfig at pack time and strips the applied overrides). This script
// packs every publishable package exactly as `changeset publish` will (pnpm
// pack, run in the package dir so publishConfig applies) and asserts the packed
// manifest ships dist, not src.
//
// Requires the publishable packages' `dist` output to already be built — run
// `pnpm exec turbo run build --filter='./packages/*'` first, or every dist
// reference will (correctly) be reported as missing from the tarball.
//
// Usage: verify-publish-exports.mjs [package-name ...]
// With no arguments, checks every publishable package. Positional arguments
// narrow the check to specific packages, matched against either the packages/
// directory name (e.g. `shared-consts`) or the manifest `name` field (e.g.
// `@codaco/shared-consts`).
//
// For each non-private package under packages/* whose package.json carries a
// publishConfig with at least one of exports/main/module/types, it asserts:
//   (a) every path in the PACKED exports/main/module/types points into dist/
//       (no src/ segment — that would mean the swap did not fire),
//   (b) every referenced file is present in the tarball, and
//   (c) no publishConfig override (exports/main/module/types) survives in the
//       packed manifest (pnpm strips applied fields; a residual means the swap
//       silently did not apply).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packagesDir = join(repoRoot, 'packages');
const SWAP_FIELDS = ['exports', 'main', 'module', 'types'];

function hasSwapFields(publishConfig) {
  return (
    !!publishConfig &&
    typeof publishConfig === 'object' &&
    SWAP_FIELDS.some((field) => field in publishConfig)
  );
}

// Collect every string leaf (a file path) from an exports subtree, ignoring the
// subpath keys and descending through condition maps, arrays, and null blocks.
function collectExportPaths(node, out) {
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectExportPaths(value, out);
  }
}

function collectReferencedPaths(manifest) {
  const refs = [];
  for (const field of ['main', 'module', 'types']) {
    if (typeof manifest[field] === 'string') refs.push(manifest[field]);
  }
  if (manifest.exports !== undefined)
    collectExportPaths(manifest.exports, refs);
  return refs;
}

// Recursively list every file in the extracted `package/` directory, relative
// to it (so `./dist/index.js` in the manifest matches `dist/index.js` here).
function listTarballFiles(root) {
  const files = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.add(relative(root, full));
    }
  };
  walk(root);
  return files;
}

function verifyPackage(pkgDir) {
  const failures = [];
  const tmp = mkdtempSync(join(tmpdir(), 'verify-publish-'));
  try {
    // `pnpm pack` has no `--ignore-scripts` option (unlike `pnpm install`). It
    // only ever runs a package's `prepack` script — none of the publishable
    // packages define one — so this is safe to run without it.
    const pack = spawnSync('pnpm', ['pack', '--pack-destination', tmp], {
      cwd: pkgDir,
      encoding: 'utf8',
    });
    if (pack.status !== 0) {
      failures.push(
        `pnpm pack failed (exit ${pack.status}): ${(pack.stderr || '').trim()}`,
      );
      return failures;
    }

    const tarball = readdirSync(tmp).find((name) => name.endsWith('.tgz'));
    if (!tarball) {
      failures.push('pnpm pack produced no .tgz tarball');
      return failures;
    }

    const extract = spawnSync('tar', ['-xzf', join(tmp, tarball), '-C', tmp], {
      encoding: 'utf8',
    });
    if (extract.status !== 0) {
      failures.push(
        `failed to extract tarball: ${(extract.stderr || '').trim()}`,
      );
      return failures;
    }

    const packageRoot = join(tmp, 'package');
    const packed = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    );
    const tarballFiles = listTarballFiles(packageRoot);

    for (const ref of collectReferencedPaths(packed)) {
      const normalized = ref.replace(/^\.\//, '');
      const segments = normalized.split('/');
      if (segments.includes('src')) {
        failures.push(
          `packed reference points into src/ (publishConfig swap did not apply): ${ref}`,
        );
        continue;
      }
      if (normalized !== 'package.json' && !normalized.startsWith('dist/')) {
        failures.push(`packed reference is outside dist/: ${ref}`);
        continue;
      }
      if (!tarballFiles.has(normalized)) {
        failures.push(`packed reference is missing from the tarball: ${ref}`);
      }
    }

    const residual = SWAP_FIELDS.filter(
      (field) => packed.publishConfig && field in packed.publishConfig,
    );
    if (residual.length > 0) {
      failures.push(
        `publishConfig still overrides ${residual.join('/')} in the packed manifest (swap did not fire)`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return failures;
}

function main() {
  if (!existsSync(packagesDir)) {
    console.error(`No packages directory at ${packagesDir}`);
    process.exit(1);
  }

  const requestedNames = process.argv.slice(2);

  const results = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = join(packagesDir, entry.name);
    const manifestPath = join(pkgDir, 'package.json');
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) continue;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      requestedNames.length > 0 &&
      !requestedNames.includes(entry.name) &&
      !requestedNames.includes(manifest.name)
    )
      continue;
    if (manifest.private || !hasSwapFields(manifest.publishConfig)) continue;

    const failures = verifyPackage(pkgDir);
    results.push({ name: manifest.name || entry.name, failures });
  }

  if (results.length === 0) {
    console.error(
      requestedNames.length > 0
        ? `No publishable package with a publishConfig field-swap matched: ${requestedNames.join(', ')}`
        : 'No publishable packages with a publishConfig field-swap were found — expected several.',
    );
    process.exit(1);
  }

  let failed = 0;
  for (const { name, failures } of results) {
    if (failures.length === 0) {
      console.log(`PASS  ${name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${name}`);
      for (const failure of failures) console.log(`        - ${failure}`);
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed} of ${results.length} publishable package tarball(s) failed export verification.`,
    );
    process.exit(1);
  }
  console.log(`\nVerified ${results.length} publishable package tarball(s).`);
}

main();
