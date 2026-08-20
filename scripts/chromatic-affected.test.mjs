import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stringify } from 'yaml';

import {
  buildProjectProjection,
  classifyFromGit,
  classifyParsedChanges,
  parseLockfile,
  resolveSnapshotKey,
  stableStringify,
  workspaceImporterClosure,
} from './chromatic-affected.mjs';

const WORKSPACE = {
  packages: ['apps/*', 'packages/*', 'tooling/*'],
  catalog: { react: '^19.0.0' },
};
const DETECTOR_PATH = fileURLToPath(
  new URL('./chromatic-affected.mjs', import.meta.url),
);

function external(version) {
  return { specifier: `^${version}`, version };
}

function linked(reference) {
  return { specifier: 'workspace:^', version: `link:${reference}` };
}

function makeLock() {
  return {
    lockfileVersion: '9.0',
    settings: {
      autoInstallPeers: true,
      excludeLinksFromLockfile: false,
    },
    importers: {
      '.': {
        devDependencies: { yaml: external('2.9.0') },
      },
      'apps/architect': {
        dependencies: {
          '@codaco/fresco-ui': linked('../../packages/fresco-ui'),
          '@codaco/interview': linked('../../packages/interview'),
          'luxon': external('3.0.0'),
        },
      },
      'apps/architect-classic': {
        dependencies: { electron: external('30.0.0') },
      },
      'apps/documentation': {
        dependencies: {
          '@codaco/fresco-ui': linked('../../packages/fresco-ui'),
          'next': external('15.0.0'),
        },
      },
      'apps/interviewer': {
        dependencies: {
          '@codaco/fresco-ui': linked('../../packages/fresco-ui'),
          '@codaco/interview': linked('../../packages/interview'),
          'vault': external('1.0.0'),
        },
      },
      'apps/interviewer-classic': {
        dependencies: { electron: external('30.0.0') },
      },
      'apps/networkcanvas.com': {
        dependencies: {
          '@codaco/fresco-ui': linked('../../packages/fresco-ui'),
          'next': external('15.0.0'),
        },
      },
      'packages/fresco-ui': {
        dependencies: {
          '@codaco/shared-consts': linked('../shared-consts'),
          'paint': external('1.0.0'),
        },
        devDependencies: {
          '@codaco/tailwind-config': linked('../../tooling/tailwind'),
        },
      },
      'packages/interview': {
        dependencies: {
          '@codaco/fresco-ui': linked('../fresco-ui'),
          'survey': external('1.0.0'),
        },
      },
      'packages/shared-consts': {},
      'packages/site-navigation-element': {
        dependencies: {
          '@codaco/fresco-ui': linked('../fresco-ui'),
          'navigation': external('1.0.0'),
        },
      },
      'tooling/tailwind': {
        dependencies: { tailwindcss: external('4.0.0') },
      },
    },
    packages: {
      'electron@30.0.0': { resolution: { integrity: 'electron' } },
      'luxon@3.0.0': { resolution: { integrity: 'luxon' } },
      'navigation@1.0.0': { resolution: { integrity: 'navigation' } },
      'next@15.0.0': { resolution: { integrity: 'next' } },
      'paint@1.0.0': { resolution: { integrity: 'paint' } },
      'pigment@1.0.0': { resolution: { integrity: 'pigment' } },
      'survey@1.0.0': { resolution: { integrity: 'survey' } },
      'tailwindcss@4.0.0': { resolution: { integrity: 'tailwind' } },
      'vault@1.0.0': { resolution: { integrity: 'vault' } },
      'yaml@2.9.0': { resolution: { integrity: 'yaml' } },
    },
    snapshots: {
      'electron@30.0.0': {},
      'luxon@3.0.0': {},
      'navigation@1.0.0': {},
      'next@15.0.0': {},
      'paint@1.0.0': { dependencies: { pigment: '1.0.0' } },
      'pigment@1.0.0': {},
      'survey@1.0.0': {},
      'tailwindcss@4.0.0': {},
      'vault@1.0.0': {},
      'yaml@2.9.0': {},
    },
  };
}

function booleans(result) {
  return {
    fresco_ui: result.fresco_ui,
    interview: result.interview,
    interviewer: result.interviewer,
  };
}

function expectAffected(result, expected) {
  assert.deepEqual(booleans(result), expected);
  for (const [key, affected] of Object.entries(expected)) {
    assert.equal(result.reasons[key].length > 0, affected);
  }
}

function manifestReader(overrides = {}) {
  return (revision, manifestPath) => {
    const version = overrides[`${revision}:${manifestPath}`] ?? '1.0.0';
    return JSON.stringify({ name: manifestPath, version });
  };
}

function classify({
  baseLock = makeLock(),
  headLock = baseLock,
  baseWorkspace = WORKSPACE,
  headWorkspace = baseWorkspace,
  changedPaths = [],
  releaseRef = '',
  versions = {},
} = {}) {
  return classifyParsedChanges({
    baseLock,
    headLock,
    mainLock: baseLock,
    baseWorkspace,
    headWorkspace,
    changedPaths,
    releaseRef,
    readFileAt: manifestReader(versions),
    mainRevision: 'main',
    headRevision: 'head',
  });
}

const NONE = { fresco_ui: false, interview: false, interviewer: false };
const FRESCO = { fresco_ui: true, interview: true, interviewer: true };
const INTERVIEW = { fresco_ui: false, interview: true, interviewer: true };
const INTERVIEWER = {
  fresco_ui: false,
  interview: false,
  interviewer: true,
};
const ARCHITECT_RELEASE = {
  fresco_ui: true,
  interview: true,
  interviewer: false,
};

test('walks workspace links through dependency and devDependency sections', () => {
  const closure = workspaceImporterClosure(makeLock(), 'apps/interviewer');
  assert.deepEqual(
    [...closure].toSorted((a, b) => a.localeCompare(b)),
    [
      'apps/interviewer',
      'packages/fresco-ui',
      'packages/interview',
      'packages/shared-consts',
      'tooling/tailwind',
    ],
  );
});

test('resolves aliases and peer-suffixed snapshot keys', () => {
  assert.equal(
    resolveSnapshotKey('alias', 'npm:real@1.0.0', { 'real@1.0.0': {} }),
    'real@1.0.0',
  );
  assert.equal(
    resolveSnapshotKey('react-dom', '19.0.0(react@19.0.0)', {
      'react-dom@19.0.0(react@19.0.0)': {},
    }),
    'react-dom@19.0.0(react@19.0.0)',
  );
});

test('fails when a dependency reference is unresolved or ambiguous', () => {
  assert.throws(
    () => resolveSnapshotKey('paint', '1.0.0', {}),
    /exactly one pnpm snapshot/,
  );
  assert.throws(
    () =>
      resolveSnapshotKey('paint', '1.0.0', {
        '1.0.0': {},
        'paint@1.0.0': {},
      }),
    /exactly one pnpm snapshot/,
  );
});

test('project projections are stable across YAML key and formatting changes', () => {
  const lock = makeLock();
  const reordered = Object.fromEntries(Object.entries(lock).toReversed());
  const compact = parseLockfile(stringify(lock));
  const expanded = parseLockfile(stringify(reordered, { indent: 4 }));
  assert.equal(
    buildProjectProjection(compact, 'packages/fresco-ui').fingerprint,
    buildProjectProjection(expanded, 'packages/fresco-ui').fingerprint,
  );
  assert.equal(stableStringify(compact), stableStringify(expanded));
});

test('rejects malformed and unsupported lockfiles', () => {
  assert.throws(() => parseLockfile('['), /Unable to parse/);
  assert.throws(
    () => parseLockfile(stringify({ ...makeLock(), lockfileVersion: '8.0' })),
    /unsupported lockfileVersion/,
  );
  assert.throws(
    () => parseLockfile(stringify({ lockfileVersion: '9.0' })),
    /missing a valid importers mapping/,
  );
});

test('fails closed when reachable package metadata is absent', () => {
  const headLock = structuredClone(makeLock());
  delete headLock.packages['paint@1.0.0'];
  expectAffected(
    classify({
      headLock,
      changedPaths: ['pnpm-lock.yaml'],
    }),
    FRESCO,
  );
});

test('classifies changed source paths by the dependency closure', () => {
  const cases = [
    ['packages/fresco-ui/src/Button.tsx', FRESCO],
    ['packages/interview/src/Interview.tsx', INTERVIEW],
    ['apps/interviewer/src/App.tsx', INTERVIEWER],
    ['tooling/tailwind/index.ts', FRESCO],
    ['apps/architect/src/App.tsx', NONE],
    ['apps/architect-classic/src/App.tsx', NONE],
    ['apps/interviewer-classic/src/App.tsx', NONE],
    ['apps/documentation/app/page.tsx', NONE],
    ['apps/networkcanvas.com/app/page.tsx', NONE],
    ['packages/site-navigation-element/src/index.ts', NONE],
    ['docs/ci.md', NONE],
  ];
  for (const [changedPath, expected] of cases) {
    expectAffected(classify({ changedPaths: [changedPath] }), expected);
  }
});

test('treats build-control and unrecognised paths as global', () => {
  for (const changedPath of [
    'package.json',
    'turbo.json',
    '.github/workflows/chromatic.yml',
    '.github/actions/turbo-ci-setup/action.yml',
    'scripts/unrecognised-build-tool.mjs',
  ]) {
    expectAffected(classify({ changedPaths: [changedPath] }), FRESCO);
  }
});

test('scopes direct importer lockfile changes', () => {
  const cases = [
    ['packages/fresco-ui', FRESCO],
    ['packages/interview', INTERVIEW],
    ['apps/interviewer', INTERVIEWER],
    ['apps/architect', NONE],
    ['apps/documentation', NONE],
    ['packages/site-navigation-element', NONE],
  ];
  for (const [importer, expected] of cases) {
    const headLock = structuredClone(makeLock());
    headLock.importers[importer].devDependencies = {
      localOnly: external('9.0.0'),
    };
    headLock.packages['localOnly@9.0.0'] = {
      resolution: { integrity: importer },
    };
    headLock.snapshots['localOnly@9.0.0'] = {};
    expectAffected(
      classify({ headLock, changedPaths: ['pnpm-lock.yaml'] }),
      expected,
    );
  }
});

test('scopes transitive snapshot and package metadata changes', () => {
  const headLock = structuredClone(makeLock());
  headLock.packages['pigment@1.0.0'].resolution.integrity = 'changed';
  expectAffected(
    classify({ headLock, changedPaths: ['pnpm-lock.yaml'] }),
    FRESCO,
  );

  const unrelatedHead = structuredClone(makeLock());
  unrelatedHead.packages['luxon@3.0.0'].resolution.integrity = 'changed';
  expectAffected(
    classify({
      headLock: unrelatedHead,
      changedPaths: ['pnpm-lock.yaml'],
    }),
    NONE,
  );
});

test('treats lockfile global metadata changes as global', () => {
  const headLock = structuredClone(makeLock());
  headLock.settings.autoInstallPeers = false;
  expectAffected(
    classify({ headLock, changedPaths: ['pnpm-lock.yaml'] }),
    FRESCO,
  );
});

test('uses lock projections to scope catalog changes and fails closed without them', () => {
  const headWorkspace = structuredClone(WORKSPACE);
  headWorkspace.catalog.react = '^20.0.0';
  expectAffected(
    classify({
      headWorkspace,
      changedPaths: ['pnpm-workspace.yaml', 'pnpm-lock.yaml'],
    }),
    NONE,
  );
  expectAffected(
    classify({ headWorkspace, changedPaths: ['pnpm-workspace.yaml'] }),
    FRESCO,
  );
});

test('treats non-catalog workspace configuration changes as global', () => {
  const headWorkspace = structuredClone(WORKSPACE);
  headWorkspace.packages.push('workers/*');
  expectAffected(
    classify({ headWorkspace, changedPaths: ['pnpm-workspace.yaml'] }),
    FRESCO,
  );
});

test('adds app release seeds in the normal Changesets lane', () => {
  expectAffected(
    classify({
      releaseRef: 'changeset-release/main',
      versions: { 'head:apps/architect/package.json': '1.1.0' },
    }),
    ARCHITECT_RELEASE,
  );
  expectAffected(
    classify({
      releaseRef: 'changeset-release/main',
      versions: { 'head:apps/interviewer/package.json': '1.1.0' },
    }),
    FRESCO,
  );
});

test('adds dependency-aware library seeds in the normal Changesets lane', () => {
  expectAffected(
    classify({
      releaseRef: 'changeset-release/main',
      versions: { 'head:packages/interview/package.json': '1.1.0' },
    }),
    INTERVIEW,
  );
  expectAffected(
    classify({
      releaseRef: 'changeset-release/main',
      versions: {
        'head:packages/site-navigation-element/package.json': '1.1.0',
      },
    }),
    NONE,
  );
});

test('does not seed documentation, website, and studio release lanes', () => {
  for (const releaseRef of [
    'changeset-release/documentation',
    'changeset-release/studio',
    'changeset-release/website',
  ]) {
    expectAffected(classify({ releaseRef }), NONE);
  }
});

test('fails closed for an unknown release lane or a lane without a version bump', () => {
  expectAffected(classify({ releaseRef: 'changeset-release/unknown' }), FRESCO);
  expectAffected(classify({ releaseRef: 'changeset-release/main' }), FRESCO);
});

function hasCommit(revision) {
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

test(
  'CLI accepts all workflow arguments and writes one JSON result to stdout',
  { skip: !hasCommit('618cd495ad') },
  () => {
    const stdout = execFileSync(
      process.execPath,
      [
        DETECTOR_PATH,
        '--base',
        '618cd495ad^',
        '--head',
        '618cd495ad',
        '--release-ref=',
        '--main',
        '618cd495ad',
      ],
      { encoding: 'utf8' },
    );
    assert.deepEqual(booleans(JSON.parse(stdout)), NONE);
    assert.equal(stdout.endsWith('\n'), true);
  },
);

for (const { revision, expected, description } of [
  {
    revision: '618cd495ad',
    expected: NONE,
    description:
      'Architect-only dependency lock update does not invalidate Storybooks',
  },
  {
    revision: 'b8778a91e',
    expected: NONE,
    description:
      'documentation, website, and site navigation updates stay isolated',
  },
  {
    revision: 'd33236bde',
    expected: NONE,
    description: 'unrelated catalog and lockfile changes stay isolated',
  },
  {
    revision: '90c8fd564',
    expected: FRESCO,
    description:
      'Fresco dependency resolution changes invalidate downstream Storybooks',
  },
]) {
  test(
    `historical regression: ${description}`,
    { skip: !hasCommit(revision) },
    () => {
      expectAffected(
        classifyFromGit({
          base: `${revision}^`,
          head: revision,
          main: revision,
        }),
        expected,
      );
    },
  );
}
