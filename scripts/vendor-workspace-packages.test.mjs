import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertBranchResolutionsCarried,
  assertSpecifierDrivenChanges,
  assertVendoredLockfile,
  collectClosure,
  lockfileEdges,
  packagesChangedSince,
  patchDockerfileForVendor,
  previouslyVendoredPackages,
  tarballName,
  withDependents,
} from './vendor-workspace-packages.mjs';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway workspace: an app depending on `ui` and `runtime`, where
// `runtime` depends on `ui`, and a private tooling package the app also uses.
// Committed and tagged as a release, so `packagesChangedSince` has a ref.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'vendor-'));
  const write = (rel, json) => {
    mkdirSync(join(root, rel), { recursive: true });
    writeFileSync(
      join(root, rel, 'package.json'),
      `${JSON.stringify(json, null, 2)}\n`,
    );
  };
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.0.0\n",
  );
  write('packages/ui', {
    name: '@x/ui',
    version: '1.0.0',
    devDependencies: { '@x/config': 'workspace:^' },
  });
  write('packages/runtime', {
    name: '@x/runtime',
    version: '2.0.0',
    dependencies: { '@x/ui': 'workspace:^', 'redux': 'catalog:' },
  });
  write('packages/exporters', { name: '@x/exporters', version: '3.0.0' });
  write('tooling/config', {
    name: '@x/config',
    version: '0.0.1',
    private: true,
  });
  write('apps/app', {
    name: 'app',
    version: '4.0.0',
    dependencies: {
      '@x/runtime': 'workspace:^',
      '@x/exporters': 'workspace:^',
    },
    devDependencies: { '@x/config': 'workspace:^' },
  });
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'ci@example.com');
  git(root, 'config', 'user.name', 'ci');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'release');
  git(root, 'tag', 'app@4.0.0');
  return root;
}

const wsPackages = {
  '@x/ui': { version: '1.0.0', private: false, dir: 'packages/ui' },
  '@x/runtime': { version: '2.0.0', private: false, dir: 'packages/runtime' },
  '@x/exporters': {
    version: '3.0.0',
    private: false,
    dir: 'packages/exporters',
  },
  '@x/config': { version: '0.0.1', private: true, dir: 'tooling/config' },
};

// The module reads the repository from the working directory, so each test
// runs inside its own throwaway workspace.
function inWorkspace(fn) {
  const root = workspace();
  const previous = process.cwd();
  process.chdir(root);
  try {
    return fn(root);
  } finally {
    process.chdir(previous);
  }
}

test('the closure follows published fields only and drops the app’s private deps', () => {
  inWorkspace(() => {
    assert.deepEqual(collectClosure(wsPackages, 'apps/app'), [
      '@x/exporters',
      '@x/runtime',
      '@x/ui',
    ]);
  });
});

test('nothing has changed right after the release', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('a committed change under a package directory marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'packages/ui/fix.ts'),
      'export const fixed = true;\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fix');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/ui',
    ]);
  });
});

test('an uncommitted change does not count — the lane releases commits', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'packages/ui/fix.ts'),
      'export const fixed = true;\n',
    );
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('re-pinning a catalog entry a package consumes marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.1.0\n  lodash: 4.0.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump redux');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/runtime',
    ]);
  });
});

test('re-pinning a catalog entry nothing in the closure consumes marks nothing', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.1.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump lodash');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('a change to a private package a closure package is built with marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'tooling/config/base.json'),
      '{ "strict": true }\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'tighten the shared tsconfig');
    const closure = collectClosure(wsPackages, 'apps/app');
    // ui is built with @x/config; runtime only depends on ui at runtime, so
    // the dependents rule, not this one, is what pulls runtime in.
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/ui',
    ]);
  });
});

test('an unknown ref is an error, never "nothing changed"', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.throws(
      () => packagesChangedSince('app@9.9.9', closure, wsPackages),
      /git diff --quiet app@9\.9\.9/,
    );
  });
});

test('dependents of a changed package are vendored with it', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(withDependents(['@x/ui'], closure, wsPackages), [
      '@x/runtime',
      '@x/ui',
    ]);
    // A leaf drags nothing else in.
    assert.deepEqual(withDependents(['@x/exporters'], closure, wsPackages), [
      '@x/exporters',
    ]);
  });
});

test('tarball names follow pnpm pack’s scoped form', () => {
  assert.equal(
    tarballName('@codaco/fresco-ui', '6.4.0'),
    'codaco-fresco-ui-6.4.0.tgz',
  );
});

test('the lockfile guard fails on a registry resolution of a vendored package', () => {
  const stage = mkdtempSync(join(tmpdir(), 'stage-'));
  const manifest = {
    vendored: { '@x/ui': 'x-ui-1.0.0.tgz' },
    registry: ['@x/exporters'],
  };
  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "importers:\n  .:\n    dependencies:\n      '@x/ui':\n        specifier: file:vendor/x-ui-1.0.0.tgz\n        version: file:vendor/x-ui-1.0.0.tgz\npackages:\n  '@x/exporters@3.0.0': {}\n",
  );
  assert.match(
    assertVendoredLockfile(stage, manifest),
    /1 vendored, 1 from registry \(@x\/exporters\)/,
  );

  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "packages:\n  '@x/ui@1.0.0': {}\n  '@x/ui@file:vendor/x-ui-1.0.0.tgz': {}\n",
  );
  assert.throws(
    () => assertVendoredLockfile(stage, manifest),
    /also resolved from the registry/,
  );

  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "packages:\n  '@x/exporters@3.0.0': {}\n",
  );
  assert.throws(
    () => assertVendoredLockfile(stage, manifest),
    /no file:vendor\/x-ui-1\.0\.0\.tgz resolution/,
  );
});

// The lines of apps/fresco/Dockerfile the patches anchor on, in order.
const DOCKERFILE = [
  'COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml prisma.config.ts env.js ./',
  'COPY --from=builder /app/pnpm-lock.yaml /tmp/pnpm-lock.yaml',
  '      "@codaco/protocol-validation@$(LV @codaco/protocol-validation)"; \\',
  '    npm pack --silent --pack-destination /tmp "@codaco/interview@$(LV @codaco/interview)"; \\',
].join('\n');

test('a vendored protocol-validation pins shared-consts to the lock when it is not vendored', () => {
  const patched = patchDockerfileForVendor(DOCKERFILE, {
    '@codaco/protocol-validation': 'codaco-protocol-validation-13.0.1.tgz',
  });
  assert.match(
    patched,
    /"\/tmp\/vendor\/codaco-protocol-validation-13\.0\.1\.tgz" \\\n\s+"@codaco\/shared-consts@\$\(LV @codaco\/shared-consts\)"; \\/,
  );
  // The interview line is untouched: it is not vendored here.
  assert.match(
    patched,
    /npm pack --silent .*@codaco\/interview@\$\(LV @codaco\/interview\)/,
  );
});

test('vendored shared-consts installs from its tarball beside a registry protocol-validation', () => {
  const patched = patchDockerfileForVendor(DOCKERFILE, {
    '@codaco/shared-consts': 'codaco-shared-consts-6.0.0.tgz',
  });
  assert.match(
    patched,
    /"@codaco\/protocol-validation@\$\(LV @codaco\/protocol-validation\)" \\\n\s+"\/tmp\/vendor\/codaco-shared-consts-6\.0\.0\.tgz"; \\/,
  );
});

test('packages outside the runner stage leave its install lines alone', () => {
  const patched = patchDockerfileForVendor(DOCKERFILE, {
    '@codaco/fresco-ui': 'codaco-fresco-ui-6.4.0.tgz',
    '@codaco/interview': 'codaco-interview-9.0.1.tgz',
  });
  assert.match(
    patched,
    /"@codaco\/protocol-validation@\$\(LV @codaco\/protocol-validation\)"; \\/,
  );
  assert.doesNotMatch(patched, /shared-consts/);
  assert.match(
    patched,
    /cp \/tmp\/vendor\/codaco-interview-9\.0\.1\.tgz \/tmp\/codaco-interview-vendored\.tgz; \\/,
  );
  assert.match(patched, /^COPY vendor \.\/vendor$/m);
  assert.match(patched, /^COPY --from=builder \/app\/vendor \/tmp\/vendor$/m);
});

test('a Dockerfile without the expected anchor fails loudly', () => {
  assert.throws(
    () =>
      patchDockerfileForVendor('FROM scratch\n', {
        '@codaco/interview': 'x.tgz',
      }),
    /deps-stage dependency COPY anchor/,
  );
});

test('a lockfile-only change since the release is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# transitive patch\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump a transitive');
    assert.throws(
      () =>
        assertSpecifierDrivenChanges(
          'app@4.0.0',
          'apps/app',
          collectClosure(wsPackages, 'apps/app'),
          wsPackages,
        ),
      /cannot reach the image, whose resolution starts from the released mirror/,
    );
  });
});

test('a lockfile change explained by a specifier change passes', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.1.0\n  lodash: 4.0.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump redux');
    assertSpecifierDrivenChanges(
      'app@4.0.0',
      'apps/app',
      collectClosure(wsPackages, 'apps/app'),
      wsPackages,
    );
  });
});

test('an unchanged lockfile needs no explanation', () => {
  inWorkspace(() => {
    assertSpecifierDrivenChanges(
      'app@4.0.0',
      'apps/app',
      collectClosure(wsPackages, 'apps/app'),
      wsPackages,
    );
  });
});

// Every hotfix bumps the app's version, so a whole-file comparison of the
// manifest would call every hotfix a specifier change and never refuse.
test('a lockfile change beside only a version bump is still lockfile-only', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# transitive patch\n",
    );
    writeFileSync(
      join(root, 'apps/app/package.json'),
      `${JSON.stringify(
        {
          name: 'app',
          version: '4.0.1',
          dependencies: {
            '@x/runtime': 'workspace:^',
            '@x/exporters': 'workspace:^',
          },
          devDependencies: { '@x/config': 'workspace:^' },
        },
        null,
        2,
      )}\n`,
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump the app and a transitive');
    assert.throws(
      () =>
        assertSpecifierDrivenChanges(
          'app@4.0.0',
          'apps/app',
          collectClosure(wsPackages, 'apps/app'),
          wsPackages,
        ),
      /cannot reach the image, whose resolution starts from the released mirror/,
    );
  });
});

test('a lockfile change beside a dependency change in a manifest passes', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'packages/exporters/package.json'),
      `${JSON.stringify(
        {
          name: '@x/exporters',
          version: '3.0.0',
          dependencies: { left: '1.0.1' },
        },
        null,
        2,
      )}\n`,
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'pin left');
    assertSpecifierDrivenChanges(
      'app@4.0.0',
      'apps/app',
      collectClosure(wsPackages, 'apps/app'),
      wsPackages,
    );
  });
});

test('a seeded policy names the previous hotfix’s tarballs, and gives them up', () => {
  const stage = mkdtempSync(join(tmpdir(), 'stage-'));
  writeFileSync(
    join(stage, 'pnpm-workspace.yaml'),
    [
      'packages:',
      "  - '.'",
      'overrides:',
      '  # Packages changed since fresco@4.1.4 (and their dependents), bundled by the hotfix lane (local tarballs).',
      "  '@codaco/fresco-ui': 'file:vendor/codaco-fresco-ui-6.4.0.tgz'",
      "  '@codaco/interview': 'file:vendor/codaco-interview-9.0.1.tgz'",
      "  'effect@3.17.7': '3.17.7'",
      '',
    ].join('\n'),
  );
  assert.deepEqual(previouslyVendoredPackages(stage), [
    '@codaco/fresco-ui',
    '@codaco/interview',
  ]);
  const remaining = readFileSync(join(stage, 'pnpm-workspace.yaml'), 'utf8');
  assert.doesNotMatch(remaining, /file:vendor/);
  assert.match(remaining, /^overrides:$/m);
  assert.match(remaining, /'effect@3\.17\.7': '3\.17\.7'/);
  // Idempotent, and quiet on a policy that vendored nothing.
  assert.deepEqual(previouslyVendoredPackages(stage), []);
});

// The mirror's workspace policy is seeded from the released mirror, so a root
// override — the usual way to patch a transitive — never reaches the image.
test('a lockfile change explained only by a root override is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# forced transitive\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.0.0\noverrides:\n  left: 1.0.1\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'override left');
    assert.throws(
      () =>
        assertSpecifierDrivenChanges(
          'app@4.0.0',
          'apps/app',
          collectClosure(wsPackages, 'apps/app'),
          wsPackages,
        ),
      /root pnpm-workspace\.yaml override or policy change does not reach the image/,
    );
  });
});

test('a lockfile change beside a re-pin nothing consumes is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.1.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump lodash, which nothing uses');
    assert.throws(
      () =>
        assertSpecifierDrivenChanges(
          'app@4.0.0',
          'apps/app',
          collectClosure(wsPackages, 'apps/app'),
          wsPackages,
        ),
      /cannot reach the image, whose resolution starts from the released mirror/,
    );
  });
});

// Only what the mirror carries can explain a lockfile change: a dependency
// edit in a private build input — or any other manifest outside the app and
// its closure — resolves nothing in the image.
test('a lockfile change explained only by a manifest outside the closure is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# transitive patch\n",
    );
    writeFileSync(
      join(root, 'tooling/config/package.json'),
      `${JSON.stringify(
        {
          name: '@x/config',
          version: '0.0.1',
          private: true,
          dependencies: { left: '1.0.1' },
        },
        null,
        2,
      )}\n`,
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'pin left in a build input');
    assert.throws(
      () =>
        assertSpecifierDrivenChanges(
          'app@4.0.0',
          'apps/app',
          collectClosure(wsPackages, 'apps/app'),
          wsPackages,
        ),
      /outside the app and its closure/,
    );
  });
});

// A pnpm v9 lockfile from importer and snapshot edge lists.
const lock = ({ importers = {}, devImporters = {}, snapshots = {} }) => {
  const out = ["lockfileVersion: '9.0'", '', 'importers:'];
  const paths = new Set([
    ...Object.keys(importers),
    ...Object.keys(devImporters),
  ]);
  for (const path of paths) {
    out.push(`  ${path}:`);
    for (const [field, source] of Object.entries({
      dependencies: importers,
      devDependencies: devImporters,
    })) {
      const deps = source[path];
      if (!deps) continue;
      out.push(`    ${field}:`);
      for (const [dep, version] of Object.entries(deps)) {
        out.push(
          `      ${dep}:`,
          `        specifier: ^1`,
          `        version: ${version}`,
        );
      }
    }
  }
  out.push('', 'packages:', '', 'snapshots:');
  for (const [key, deps] of Object.entries(snapshots)) {
    out.push(`  ${key}:`);
    if (Object.keys(deps).length) out.push('    dependencies:');
    for (const [dep, version] of Object.entries(deps)) {
      out.push(`      ${dep}: ${version}`);
    }
  }
  return `${out.join('\n')}\n`;
};

const graphArgs = {
  appImporter: 'apps/app',
  closureImporters: { 'packages/ui': '@x/ui' },
  workspaceNames: new Set(['@x/ui', '@x/runtime', '@x/exporters', '@x/config']),
};

test('lockfile edges parse importers and snapshots, dropping peer suffixes', () => {
  const { importers, snapshots } = lockfileEdges(
    lock({
      importers: {
        'apps/app': {
          'next': '15.5.0(react@19.2.8)',
          "'@x/ui'": 'link:../../packages/ui',
        },
      },
      snapshots: {
        "'@adobe/css-tools@4.5.0'": {},
        'next@15.5.0(react@19.2.8)': {
          "'@next/env'": '15.5.0',
          'react': '19.2.8',
        },
      },
    }),
  );
  // Values keep their peer suffix too: a move to another peer context is a
  // different resolution.
  assert.equal(importers.get('apps/app').get('next'), '15.5.0(react@19.2.8)');
  assert.equal(
    importers.get('apps/app').get('@x/ui'),
    'link:../../packages/ui',
  );
  // Snapshot identity keeps the peer context as well.
  assert.equal(
    snapshots.get('next@15.5.0(react@19.2.8)').get('@next/env'),
    '15.5.0',
  );
  assert.ok(!snapshots.has('next@15.5.0'));
  assert.ok(snapshots.has('@adobe/css-tools@4.5.0'));
});

// A manifest edit for one dependency must not mask a lockfile-only patch to
// another: the seeded resolution would leave the second at its released
// version, so the check compares what the branch changed with what arrived.
test('an app edge the branch changed but the mirror kept is refused', () => {
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock: lock({ importers: { 'apps/app': { left: '1.0.0' } } }),
        headLock: lock({ importers: { 'apps/app': { left: '1.0.1' } } }),
        mirrorLock: lock({ importers: { '.': { left: '1.0.0' } } }),
      }),
    /apps\/app → left: the branch resolves 1\.0\.1; the image would keep 1\.0\.0/,
  );
});

const fooDependingOnBar = (bar) => ({ 'foo@1.0.0': { bar } });

test('a transitive edge the branch changed under an unchanged parent is refused', () => {
  const snapshots = fooDependingOnBar;
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock: lock({ snapshots: snapshots('1.0.0') }),
        headLock: lock({ snapshots: snapshots('1.0.1') }),
        mirrorLock: lock({ snapshots: snapshots('1.0.0') }),
      }),
    /foo@1\.0\.0 → bar: the branch resolves 1\.0\.1; the image would keep 1\.0\.0/,
  );
  // The image does not install foo: nothing to check.
  assertBranchResolutionsCarried({
    ...graphArgs,
    refLock: lock({ snapshots: snapshots('1.0.0') }),
    headLock: lock({ snapshots: snapshots('1.0.1') }),
    mirrorLock: lock({ snapshots: { 'other@1.0.0': {} } }),
  });
});

// The case a flat set of versions misses: ui moves foo@1 → foo@2 while another
// workspace already used foo@2 at the release, so no version is new globally,
// but ui's edge is — and the vendored ui in the mirror must carry it.
test('a closure package edge moving to a version another workspace already had is still checked', () => {
  const refLock = lock({
    importers: {
      'packages/ui': { foo: '1.0.0' },
      'apps/other': { foo: '2.0.0' },
    },
  });
  const headLock = lock({
    importers: {
      'packages/ui': { foo: '2.0.0' },
      'apps/other': { foo: '2.0.0' },
    },
  });
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock,
        headLock,
        mirrorLock: lock({
          snapshots: { "'@x/ui@file:vendor/x-ui-1.0.0.tgz'": { foo: '1.0.0' } },
        }),
      }),
    /@x\/ui@file:vendor\/x-ui-1\.0\.0\.tgz → foo: the branch resolves 2\.0\.0; the image would keep 1\.0\.0/,
  );
  assertBranchResolutionsCarried({
    ...graphArgs,
    refLock,
    headLock,
    mirrorLock: lock({
      snapshots: { "'@x/ui@file:vendor/x-ui-1.0.0.tgz'": { foo: '2.0.0' } },
    }),
  });
});

test('edges to workspace packages and edges the mirror carries pass', () => {
  assertBranchResolutionsCarried({
    ...graphArgs,
    refLock: lock({
      importers: {
        'apps/app': { "'@x/ui'": 'link:../../packages/ui', 'left': '1.0.0' },
      },
    }),
    headLock: lock({
      importers: { 'apps/app': { "'@x/ui'": 'link:../ui', 'left': '1.0.1' } },
    }),
    mirrorLock: lock({
      importers: {
        '.': { "'@x/ui'": 'file:vendor/x-ui-1.0.0.tgz', 'left': '1.0.1' },
      },
    }),
  });
});

// One version resolved in two peer contexts is two graphs. A branch edge
// changed in the context the image uses must be carried there; an edge that
// changed only in another context must neither satisfy nor fail the check.
test('peer contexts are compared one to one, never merged', () => {
  const react19 = 'foo@1.0.0(react@19.2.8)';
  const react16 = 'foo@1.0.0(react@16.14.0)';
  // Both contexts move bar in the branch; the image (React 19) kept the old one.
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock: lock({
          snapshots: {
            [react16]: { bar: '1.0.0' },
            [react19]: { bar: '1.0.0' },
          },
        }),
        headLock: lock({
          snapshots: {
            [react16]: { bar: '1.0.1' },
            [react19]: { bar: '1.0.1' },
          },
        }),
        mirrorLock: lock({ snapshots: { [react19]: { bar: '1.0.0' } } }),
      }),
    /foo@1\.0\.0\(react@19\.2\.8\) → bar: the branch resolves 1\.0\.1; the image would keep 1\.0\.0/,
  );
  // Only the other context moved: the image's context is unchanged, so the
  // edge it carries is still the branch's — whichever order the contexts
  // appear in.
  for (const order of [
    [react16, react19],
    [react19, react16],
  ]) {
    const snaps = (a, b) =>
      Object.fromEntries([
        [order[0], a],
        [order[1], b],
      ]);
    assertBranchResolutionsCarried({
      ...graphArgs,
      refLock: lock({ snapshots: snaps({ bar: '1.0.0' }, { bar: '1.0.0' }) }),
      headLock: lock({ snapshots: snaps({ bar: '1.0.1' }, { bar: '1.0.0' }) }),
      mirrorLock: lock({ snapshots: { [order[1]]: { bar: '1.0.0' } } }),
    });
  }
});

test('a closure package is checked in every peer context the mirror holds it in', () => {
  const refLock = lock({ importers: { 'packages/ui': { foo: '1.0.0' } } });
  const headLock = lock({ importers: { 'packages/ui': { foo: '1.0.1' } } });
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock,
        headLock,
        mirrorLock: lock({
          snapshots: {
            "'@x/ui@file:vendor/x-ui-1.0.0.tgz(react@19.2.8)'": {
              foo: '1.0.1',
            },
            "'@x/ui@file:vendor/x-ui-1.0.0.tgz(react@16.14.0)'": {
              foo: '1.0.0',
            },
          },
        }),
      }),
    /@x\/ui@file:vendor\/x-ui-1\.0\.0\.tgz\(react@16\.14\.0\) → foo/,
  );
});

test('an edge that moved only to another peer context is still a change to carry', () => {
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock: lock({
          importers: { 'apps/app': { foo: '1.0.0(peer@1.0.0)' } },
        }),
        headLock: lock({
          importers: { 'apps/app': { foo: '1.0.0(peer@2.0.0)' } },
        }),
        mirrorLock: lock({ importers: { '.': { foo: '1.0.0(peer@1.0.0)' } } }),
      }),
    /apps\/app → foo: the branch resolves 1\.0\.0\(peer@2\.0\.0\); the image would keep 1\.0\.0\(peer@1\.0\.0\)/,
  );
});

// The mirror reads a few catalog entries on the app's behalf; a re-pin of one
// of those is carried although no workspace manifest names it.
test('a re-pin of a catalog entry the mirror itself consumes explains a lockfile change', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.1.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump lodash, which only the mirror uses');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.throws(() =>
      assertSpecifierDrivenChanges(
        'app@4.0.0',
        'apps/app',
        closure,
        wsPackages,
      ),
    );
    assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', closure, wsPackages, {
      mirrorCatalogEntries: ['lodash'],
    });
  });
});

// A packed package's snapshot carries only its published dependencies; a
// closure package's changed devDependency (a compiler, a build plugin) is
// already in the rebuilt tarball and must not be reported as missing.
test('a closure package’s devDependency edge is not compared against its snapshot', () => {
  const mirrorLock = lock({
    snapshots: { "'@x/ui@file:vendor/x-ui-1.0.0.tgz'": { foo: '1.0.0' } },
  });
  assertBranchResolutionsCarried({
    ...graphArgs,
    refLock: lock({
      importers: { 'packages/ui': { foo: '1.0.0' } },
      devImporters: { 'packages/ui': { esbuild: '0.20.0' } },
    }),
    headLock: lock({
      importers: { 'packages/ui': { foo: '1.0.0' } },
      devImporters: { 'packages/ui': { esbuild: '0.21.0' } },
    }),
    mirrorLock,
  });
  // The app's devDependencies are installed by the image build, so the
  // root importer comparison still covers them.
  assert.throws(
    () =>
      assertBranchResolutionsCarried({
        ...graphArgs,
        refLock: lock({ devImporters: { 'apps/app': { vitest: '3.0.0' } } }),
        headLock: lock({ devImporters: { 'apps/app': { vitest: '3.0.1' } } }),
        mirrorLock: lock({ devImporters: { '.': { vitest: '3.0.0' } } }),
      }),
    /apps\/app → vitest: the branch resolves 3\.0\.1; the image would keep 3\.0\.0/,
  );
});

// A closure package whose build tool moved only in the root lockfile — no
// manifest or catalog edit — was built with the old tool when published, so
// it is rebuilt and vendored like any other changed package.
test('a package whose importer resolved a build input differently is vendored again', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    const refLock = lock({
      devImporters: { 'packages/ui': { esbuild: '0.20.0' } },
    });
    const headLock = lock({
      devImporters: { 'packages/ui': { esbuild: '0.21.0' } },
    });
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages, {
        refLock,
        headLock,
      }),
      ['@x/ui'],
    );
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages, {
        refLock,
        headLock: refLock,
      }),
      [],
    );
  });
});
