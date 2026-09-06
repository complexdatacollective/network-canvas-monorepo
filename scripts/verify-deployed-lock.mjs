import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const groups = ['dependencies', 'optionalDependencies'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const baseKey = (key) => key.split('(')[0];
const patchKey = (key) => /\(patch_hash=([a-f0-9]+)\)/.exec(key)?.[1] ?? null;
const snapshotKey = (lock, name, version) =>
  Object.hasOwn(lock.snapshots, `${name}@${version}`)
    ? `${name}@${version}`
    : version;

function assertLock(lock) {
  if (
    String(lock?.lockfileVersion) !== '9.0' ||
    !lock.importers ||
    !lock.packages ||
    !lock.snapshots
  )
    throw new Error('A complete pnpm v9 deployment lockfile is required.');
}

/**
 * Legacy deploy may rewrite peer-context labels and add `optional: true`.
 * Compare each edge recursively against its original selected edge instead of
 * accepting any package version that happens to occur elsewhere in the repo.
 * Name/version, integrity, patches, required/optional edges and peer bindings
 * must remain equivalent. Only labels and reachability metadata may differ.
 */
export function verifyDeployedLock(source, deployed, importer) {
  assertLock(source);
  assertLock(deployed);
  const original = source.importers[importer];
  const selected = deployed.importers[importer];
  if (
    !original ||
    !selected ||
    Object.keys(selected).some((key) => !groups.includes(key))
  )
    throw new Error('The selected production importer is unavailable.');
  const visitedPairs = new Set();
  const snapshots = {};
  const resolutions = {};
  function visit(name, expectedVersion, actualVersion) {
    const expectedKey = snapshotKey(source, name, expectedVersion);
    const actualKey = snapshotKey(deployed, name, actualVersion);
    const pair = JSON.stringify([expectedKey, actualKey]);
    if (visitedPairs.has(pair)) return;
    visitedPairs.add(pair);
    const expected = source.snapshots[expectedKey];
    const actual = deployed.snapshots[actualKey];
    const base = baseKey(expectedKey);
    if (
      !expected ||
      !actual ||
      base !== baseKey(actualKey) ||
      patchKey(expectedKey) !== patchKey(actualKey) ||
      !source.packages[base] ||
      !isDeepStrictEqual(source.packages[base], deployed.packages[base]) ||
      !isDeepStrictEqual(
        source.patchedDependencies?.[base],
        deployed.patchedDependencies?.[base],
      )
    )
      throw new Error(
        `Deployment changed a selected package resolution: ${name}`,
      );
    snapshots[actualKey] = actual;
    resolutions[base] = deployed.packages[base];
    for (const group of groups) {
      const originalEdges = expected[group] ?? {};
      const actualEdges = actual[group] ?? {};
      if (
        !isDeepStrictEqual(
          Object.keys(originalEdges).sort(),
          Object.keys(actualEdges).sort(),
        )
      )
        throw new Error(`Deployment changed dependency edges: ${name}`);
      for (const dependency of Object.keys(originalEdges))
        visit(dependency, originalEdges[dependency], actualEdges[dependency]);
    }
  }
  for (const group of groups) {
    if (!isDeepStrictEqual(original[group] ?? {}, selected[group] ?? {}))
      throw new Error('Deployment changed the selected production importer.');
    for (const [name, dependency] of Object.entries(selected[group] ?? {})) {
      if (dependency.version.startsWith('link:')) continue; // Source-first workspaces are bundled by the app build.
      visit(name, original[group][name].version, dependency.version);
    }
  }
  if (
    !visitedPairs.size ||
    !isDeepStrictEqual(
      Object.keys(snapshots).sort(),
      Object.keys(deployed.snapshots).sort(),
    ) ||
    !isDeepStrictEqual(
      Object.keys(resolutions).sort(),
      Object.keys(deployed.packages).sort(),
    )
  )
    throw new Error(
      'Deployment includes dependencies outside its selected production closure.',
    );
  return { importer, root: selected, snapshots, resolutions };
}

/** Verify actual installed manifests and links, not merely the lockfile claim. */
export function verifyInstalledDeployment(directory, graph) {
  const root = realpathSync(directory);
  const modules = join(root, 'node_modules');
  const visited = new Map();
  function locate(from, name) {
    for (
      let parent = from;
      parent === root || parent.startsWith(`${root}${sep}`);
      parent = dirname(parent)
    ) {
      const path = join(parent, 'node_modules', name);
      if (existsSync(path)) {
        const physical = realpathSync(path);
        if (!physical.startsWith(`${modules}${sep}`))
          throw new Error('An installed dependency escapes the deployment.');
        return physical;
      }
      if (parent === root) break;
    }
    return null;
  }
  function visit(from, name, version, optional) {
    const path = locate(from, name);
    if (!path) {
      if (optional) return;
      throw new Error(`A required deployed dependency is missing: ${name}`);
    }
    const key = snapshotKey(graph, name, version);
    const snapshot = graph.snapshots[key];
    if (!snapshot)
      throw new Error(
        'An installed dependency is absent from the verified graph.',
      );
    const bytes = readFileSync(join(path, 'package.json'));
    const manifest = JSON.parse(bytes);
    if (`${manifest.name}@${manifest.version}` !== baseKey(key))
      throw new Error(
        `An installed dependency differs from its selected version: ${name}`,
      );
    const existing = visited.get(path);
    if (existing) {
      if (existing.key !== key)
        throw new Error(
          'An installed peer context aliases another dependency graph.',
        );
      return;
    }
    visited.set(path, {
      key,
      name: manifest.name,
      version: manifest.version,
      manifestSha256: hash(bytes),
    });
    for (const group of groups)
      for (const [dependency, selected] of Object.entries(
        snapshot[group] ?? {},
      ))
        visit(path, dependency, selected, group === 'optionalDependencies');
  }
  for (const group of groups)
    for (const [name, dependency] of Object.entries(graph.root[group] ?? {}))
      if (!dependency.version.startsWith('link:'))
        visit(root, name, dependency.version, group === 'optionalDependencies');
  // A hidden, unreferenced package must not bypass the selected graph check.
  const store = join(modules, '.pnpm');
  for (const entry of readdirSync(store, { withFileTypes: true })) {
    const nested = join(store, entry.name, 'node_modules');
    if (
      !entry.isDirectory() ||
      entry.name === 'node_modules' ||
      !existsSync(nested)
    )
      continue;
    const packages = readdirSync(nested).flatMap((name) =>
      name.startsWith('@')
        ? readdirSync(join(nested, name)).map((child) =>
            join(nested, name, child),
          )
        : [join(nested, name)],
    );
    for (const path of packages) {
      if (
        !lstatSync(path).isDirectory() ||
        !existsSync(join(path, 'package.json'))
      )
        continue;
      if (!visited.has(realpathSync(path)))
        throw new Error(
          'An installed package is outside the verified dependency graph.',
        );
    }
  }
  if (!visited.size)
    throw new Error('The deployed dependency inventory is empty.');
  return [...visited.values()].toSorted((left, right) =>
    left.key.localeCompare(right.key),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [sourcePath, directory, importer, output] = process.argv.slice(2);
    if (
      !sourcePath ||
      !directory ||
      !importer ||
      !output ||
      process.argv.length !== 6
    )
      throw new Error(
        'Expected source lockfile, deployment directory, importer and output path.',
      );
    const { parse } = await import('yaml');
    const bytes = readFileSync(join(directory, 'node_modules/.pnpm/lock.yaml'));
    const graph = verifyDeployedLock(
      parse(readFileSync(sourcePath, 'utf8')),
      parse(bytes.toString()),
      importer,
    );
    const installed = verifyInstalledDeployment(resolve(directory), graph);
    writeFileSync(
      output,
      `${JSON.stringify({ format: 1, importer, lockSha256: hash(bytes), installed, resolutions: graph.resolutions }, null, 2)}\n`,
      { flag: 'wx' },
    );
  } catch (error) {
    process.stderr.write(
      `Deployment lock verification failed: ${error instanceof Error ? error.message : 'invalid metadata'}\n`,
    );
    process.exitCode = 1;
  }
}
