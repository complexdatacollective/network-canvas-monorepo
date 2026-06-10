#!/usr/bin/env node
// Rewrites an app's package.json so it can be installed with plain `npm install`
// outside the pnpm workspace. Every pnpm-specific dependency specifier is resolved
// to a concrete, registry-installable version:
//
//   catalog:        -> the version pinned in pnpm-workspace.yaml's `catalog:` block
//   workspace:*     -> `^<version>` of the published monorepo package, OR dropped
//                      entirely when the workspace package is private (unpublishable,
//                      e.g. another app used only as a build-time dependency)
//
// After rewriting, it asserts that no `workspace:`/`catalog:` specifier remains.
//
// Usage:
//   node scripts/resolve-manifest.mjs <appDir> [--out <path>]
//   (omit --out to print the resolved manifest to stdout)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

// Parse the (single, default) `catalog:` block of pnpm-workspace.yaml into a
// { packageName: versionRange } map. Deliberately minimal — the block is a flat
// list of `key: value` pairs, optionally quoted.
function parseCatalog(workspaceYaml) {
  const catalog = {};
  let inCatalog = false;
  for (const line of workspaceYaml.split('\n')) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (!inCatalog) continue;
    if (/^\S/.test(line)) break; // dedent to column 0 ends the block
    const match = line.match(/^\s+(['"]?)([^'":]+)\1\s*:\s*(.+?)\s*$/);
    if (match) {
      const value = match[3].replace(/^['"]|['"]$/g, '');
      catalog[match[2]] = value;
    }
  }
  return catalog;
}

// Map of every workspace package name -> { version, private } by scanning the
// directories that hold publishable/app packages.
function readWorkspacePackages() {
  const map = {};
  for (const group of ['packages', 'apps']) {
    const base = join(repoRoot, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const pkgPath = join(base, entry, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const json = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (json.name) {
        map[json.name] = {
          version: json.version,
          private: Boolean(json.private),
        };
      }
    }
  }
  return map;
}

function resolveSpec(name, spec, { catalog, wsPackages, appName }) {
  if (spec.startsWith('catalog:')) {
    const named = spec.slice('catalog:'.length);
    if (named) {
      throw new Error(
        `${appName}: named catalog "${spec}" for "${name}" is not supported; only the default catalog is resolved.`,
      );
    }
    const version = catalog[name];
    if (!version) {
      throw new Error(`${appName}: no default catalog entry for "${name}".`);
    }
    return { action: 'set', version };
  }
  if (spec.startsWith('workspace:')) {
    const ws = wsPackages[name];
    if (!ws) {
      throw new Error(`${appName}: unknown workspace package "${name}".`);
    }
    if (ws.private) {
      return { action: 'drop' };
    }
    return { action: 'set', version: `^${ws.version}` };
  }
  return { action: 'keep' };
}

// Returns { manifest, dropped: string[] }.
export function resolveManifest(appDir, { catalog, wsPackages } = {}) {
  const resolvedCatalog =
    catalog ??
    parseCatalog(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'));
  const resolvedWs = wsPackages ?? readWorkspacePackages();
  const manifest = JSON.parse(
    readFileSync(join(appDir, 'package.json'), 'utf8'),
  );
  const appName = manifest.name ?? appDir;
  const dropped = [];

  for (const field of DEP_FIELDS) {
    const deps = manifest[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue;
      const result = resolveSpec(name, spec, {
        catalog: resolvedCatalog,
        wsPackages: resolvedWs,
        appName,
      });
      if (result.action === 'set') deps[name] = result.version;
      else if (result.action === 'drop') {
        delete deps[name];
        dropped.push(name);
      }
    }
  }

  // Belt-and-braces: fail loudly if anything pnpm-specific survived.
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec === 'string' && /^(workspace|catalog):/.test(spec)) {
        throw new Error(
          `${appName}: unresolved specifier "${spec}" for "${name}".`,
        );
      }
    }
  }

  return { manifest, dropped };
}

function main() {
  const argv = process.argv.slice(2);
  const appDir = argv[0];
  if (!appDir) {
    console.error(
      'Usage: node scripts/resolve-manifest.mjs <appDir> [--out <path>]',
    );
    process.exit(1);
  }
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex !== -1 ? argv[outIndex + 1] : null;

  const { manifest, dropped } = resolveManifest(appDir);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (outPath) {
    writeFileSync(outPath, serialized);
    console.error(
      `[resolve-manifest] wrote ${outPath}` +
        (dropped.length
          ? ` (dropped private workspace deps: ${dropped.join(', ')})`
          : ''),
    );
  } else {
    process.stdout.write(serialized);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
