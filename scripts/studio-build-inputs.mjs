import { posix } from 'node:path';

import { parse } from 'yaml';

/** Select the frozen pnpm v9 graph, including bundled dev and optional edges. */
export function lockedBuildInputs(
  candidate,
  packages,
  { includeRoot = false } = {},
) {
  const lock = parse(candidate.read('pnpm-lock.yaml'));
  if (
    String(lock.lockfileVersion) !== '9.0' ||
    !lock.importers ||
    !lock.snapshots ||
    !lock.packages
  )
    throw new Error(
      'Studio release qualification requires a supported, complete pnpm lockfile.',
    );
  const importers = {};
  const snapshots = {};
  const resolutions = {};
  const patches = {};
  const workspace = parse(candidate.read('pnpm-workspace.yaml'));
  const selectedDirs = new Set(
    packages.map((name) => candidate.packages.get(name).dir),
  );
  if (includeRoot) selectedDirs.add('.');

  function visit(name, version) {
    const key = Object.hasOwn(lock.snapshots, `${name}@${version}`)
      ? `${name}@${version}`
      : version;
    if (!Object.hasOwn(lock.snapshots, key))
      throw new Error(`Missing locked Studio dependency: ${name}`);
    if (Object.hasOwn(snapshots, key)) return;
    const snapshot = lock.snapshots[key];
    snapshots[key] = snapshot;
    const base = key.split('(')[0];
    if (!Object.hasOwn(lock.packages, base))
      throw new Error(`Missing locked dependency resolution: ${name}`);
    resolutions[base] = lock.packages[base];
    if (lock.patchedDependencies?.[base]) {
      const path = workspace.patchedDependencies?.[base];
      if (typeof path !== 'string')
        throw new Error(`Missing dependency patch: ${name}`);
      patches[path] = candidate.read(path);
    }
    for (const [dependency, resolved] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    }))
      visit(dependency, resolved);
  }

  for (const dir of selectedDirs) {
    const importer = lock.importers[dir];
    if (!importer) throw new Error(`Missing locked Studio workspace: ${dir}`);
    importers[dir] = importer;
    for (const [name, dependency] of Object.entries({
      ...importer.dependencies,
      ...importer.devDependencies,
      ...importer.optionalDependencies,
    })) {
      if (dependency.version.startsWith('link:')) {
        const target = posix.normalize(
          posix.join(dir, dependency.version.slice(5)),
        );
        if (!selectedDirs.has(target))
          throw new Error(
            `Workspace lock graph disagrees with manifests: ${name}`,
          );
      } else visit(name, dependency.version);
    }
  }
  // Catalog resolutions are already bound by the selected importers. An
  // unrelated registry-only dependency must not change the Studio image's
  // dependency identity. Global install/build settings still participate.
  const {
    catalog: _catalog,
    catalogs: _catalogs,
    patchedDependencies: _patches,
    ...settings
  } = workspace;
  const root = JSON.parse(candidate.read('package.json'));
  return {
    importers,
    snapshots,
    resolutions,
    patches,
    settings,
    packageManager: root.packageManager,
    global: candidate.files
      .filter(({ path }) => ['.npmrc', '.nvmrc', 'turbo.json'].includes(path))
      .map(({ path, mode, oid }) => [path, mode, oid]),
  };
}

/** Inputs copied into or executing the distribution build, outside workspaces. */
export function distributionInputs(candidate) {
  const workspaces = [...candidate.packages.values()].map(
    ({ dir }) => `${dir}/`,
  );
  return candidate.files
    .filter(({ path }) => {
      if (
        [
          'package.json',
          'pnpm-workspace.yaml',
          '.dockerignore',
          '.npmrc',
          '.nvmrc',
          'turbo.json',
        ].includes(path)
      )
        return true;
      if (path.startsWith('patches/')) return true;
      if (path.startsWith('scripts/')) return !/\.(?:test|spec)\./.test(path);
      if (path.startsWith('.github/workflows/'))
        return path.includes('studio') || path.endsWith('ci-and-release.yml');
      // Studio's Dockerfile, Compose, entrypoint, recovery scripts and embedded
      // operator documentation are real image/installer inputs. Package source
      // is recorded through the component closure instead.
      if (path.startsWith('apps/studio/'))
        return !workspaces.some((dir) => path.startsWith(dir));
      return (
        path.startsWith('apps/template-registry/deployment/') ||
        path === 'apps/template-registry/Dockerfile'
      );
    })
    .map(({ path, mode, oid }) => [path, mode, oid]);
}
