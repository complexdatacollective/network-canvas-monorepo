// Copies a canonical protocol (protocol.json + assets/) from this package into
// one of the published compatibility packages.
//
// The compat packages' copies are tracked in Git, so this script must never
// leave the working tree in a half-written state:
//
//   - Nothing is touched when the target already matches the source, which is
//     the normal case for a clean checkout. No mtime churn, no cache busting.
//   - When a write is needed, everything is staged under a sibling temp
//     directory first, so the only mutation of the real paths is a rename.
//     A `cp -r` directly over `assets/` would leave the tracked files missing
//     for the whole copy, and permanently missing if the process died there.
//
// Invoked from each compat package's `prepack` (publish time) and, in
// comparison-only form, by check-compat-packages.mjs (pnpm check:compat-protocols).
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const protocolSources = {
  development: path.join(packageRoot, 'development'),
  sample: path.join(packageRoot, 'sample'),
};

// Staging area for the copies. A single directory keeps the swap on the same
// filesystem as the target (so `rename` is atomic) and needs only one
// .gitignore entry in each compat package.
const STAGING_DIR = '.sync-tmp';

// Code-unit ordering, matching the default `Array#sort` comparison for strings.
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Relative paths of every file under `dir`, sorted. */
async function listFiles(dir, prefix = '') {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(
        ...((await listFiles(path.join(dir, entry.name), relativePath)) ?? []),
      );
    } else {
      files.push(relativePath);
    }
  }
  return files.toSorted(byPath);
}

async function filesAreEqual(a, b) {
  try {
    const [statA, statB] = await Promise.all([stat(a), stat(b)]);
    if (statA.size !== statB.size) {
      return false;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  const [bytesA, bytesB] = await Promise.all([readFile(a), readFile(b)]);
  return bytesA.equals(bytesB);
}

/**
 * Compares a canonical protocol directory against a compat package directory.
 * Returns the human-readable differences; an empty array means they match.
 */
export async function diffCompatPackage(sourceDir, targetDir) {
  const differences = [];

  if (
    !(await filesAreEqual(
      path.join(sourceDir, 'protocol.json'),
      path.join(targetDir, 'protocol.json'),
    ))
  ) {
    differences.push('protocol.json differs');
  }

  const sourceAssets = (await listFiles(path.join(sourceDir, 'assets'))) ?? [];
  const targetAssets = await listFiles(path.join(targetDir, 'assets'));

  if (targetAssets === null) {
    differences.push('assets/ is missing');
    return differences;
  }

  const targetSet = new Set(targetAssets);
  const sourceSet = new Set(sourceAssets);

  for (const file of sourceAssets) {
    if (!targetSet.has(file)) {
      differences.push(`assets/${file} is missing`);
    } else if (
      !(await filesAreEqual(
        path.join(sourceDir, 'assets', file),
        path.join(targetDir, 'assets', file),
      ))
    ) {
      differences.push(`assets/${file} differs`);
    }
  }

  for (const file of targetAssets) {
    if (!sourceSet.has(file)) {
      differences.push(`assets/${file} is not in the canonical protocol`);
    }
  }

  return differences.toSorted(byPath);
}

/**
 * Makes `targetDir` match the canonical protocol, writing nothing when it
 * already does. Returns true when files were written.
 */
export async function syncCompatPackage(protocolId, targetDir) {
  const sourceDir = protocolSources[protocolId];
  if (!sourceDir) {
    throw new Error(
      `Unknown protocol "${protocolId}". Expected one of: ${Object.keys(protocolSources).join(', ')}`,
    );
  }

  await mkdir(targetDir, { recursive: true });

  if ((await diffCompatPackage(sourceDir, targetDir)).length === 0) {
    return false;
  }

  const staging = path.join(targetDir, STAGING_DIR);
  await rm(staging, { recursive: true, force: true });

  try {
    await mkdir(staging, { recursive: true });
    await cp(
      path.join(sourceDir, 'protocol.json'),
      path.join(staging, 'protocol.json'),
    );
    await cp(path.join(sourceDir, 'assets'), path.join(staging, 'assets'), {
      recursive: true,
    });

    // Same-directory rename: replaces the file atomically.
    await rename(
      path.join(staging, 'protocol.json'),
      path.join(targetDir, 'protocol.json'),
    );

    // `rename` refuses to replace a non-empty directory, so displace the old
    // one first. The gap where assets/ does not exist spans two renames rather
    // than a multi-megabyte recursive copy, and the previous contents survive
    // under the staging directory until the new ones are in place.
    const assets = path.join(targetDir, 'assets');
    const displaced = path.join(staging, 'assets.previous');
    let hasExistingAssets = true;
    try {
      await rename(assets, displaced);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      hasExistingAssets = false;
    }

    try {
      await rename(path.join(staging, 'assets'), assets);
    } catch (error) {
      if (hasExistingAssets) {
        await rename(displaced, assets);
      }
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return true;
}

// CLI entry point: `node sync-compat-package.mjs <protocol> [targetDir]`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [protocolId, targetDirArg = '.'] = process.argv.slice(2);
  const targetDir = path.resolve(process.cwd(), targetDirArg);

  try {
    const written = await syncCompatPackage(protocolId, targetDir);
    console.log(
      written
        ? `Synced ${protocolId} protocol into ${targetDir}`
        : `${protocolId} protocol already up to date in ${targetDir}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
