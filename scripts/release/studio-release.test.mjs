import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect, Schema } from 'effect';
import { test } from 'vitest';

import { ReleaseManifest } from '../../apps/studio/api/src/update/manifest.ts';
import { GATED_PRODUCT_DIRS } from './changeset-app-utils.mjs';
import {
  bundledPackages,
  MIGRATIONS_DIR,
  mergeSboms,
  movedWithoutApi,
  newestMigration,
  planRelease,
  RELEASE_BODY_LIMIT,
  releaseManifest,
  SBOM_REFERENCE_TYPE,
  sbomReference,
  studioReleaseNotes,
} from './studio-release.mjs';

const SCRIPT = fileURLToPath(new URL('./studio-release.mjs', import.meta.url));
const API_DIGEST = `sha256:${'a'.repeat(64)}`;
const WEB_DIGEST = `sha256:${'b'.repeat(64)}`;
const COMMIT = 'c'.repeat(40);

const versions = (api, web, contract = '0.2.0', sync = '0.3.0') => ({
  '@codaco/studio-api': api,
  '@codaco/studio-web': web,
  '@codaco/studio-contract': contract,
  '@codaco/studio-sync': sync,
});

test('an untagged studio-api version is released, and a tagged one is not', () => {
  assert.equal(
    planRelease({
      apiVersion: '1.2.0',
      previousApiVersion: '1.1.0',
      tags: ['studio@1.1.0'],
    }).released,
    true,
  );
  assert.deepEqual(
    planRelease({
      apiVersion: '1.2.0',
      previousApiVersion: '1.2.0',
      tags: ['studio@1.1.0'],
    }),
    {
      released: false,
      reason:
        "this push did not change @codaco/studio-api's version from 1.2.0",
    },
    'a later push never builds an untagged release from a tree that is not the release PR',
  );
  assert.deepEqual(
    planRelease({
      apiVersion: '1.1.0',
      previousApiVersion: '1.0.0',
      tags: ['studio@1.1.0'],
    }),
    { released: false, reason: 'studio@1.1.0 already exists' },
  );
  assert.equal(
    planRelease({
      apiVersion: '1.2.0-rc.1',
      previousApiVersion: '1.1.0',
      tags: [],
    }).released,
    false,
  );
});

test('before the first release, only the push that moves studio-api releases', () => {
  assert.equal(
    planRelease({
      apiVersion: '0.3.0',
      previousApiVersion: '0.3.0',
      tags: ['@codaco/studio-api@0.3.0'],
    }).released,
    false,
    'the version main held when the lane arrived is not a release, and other tags do not count',
  );
  assert.equal(
    planRelease({ apiVersion: '0.4.0', previousApiVersion: '0.3.0', tags: [] })
      .released,
    true,
  );
});

test('a release PR that moves a Studio package without studio-api is refused', () => {
  assert.deepEqual(
    movedWithoutApi({
      current: versions('1.0.0', '1.1.0', '0.3.0'),
      baseline: versions('1.0.0', '1.0.0'),
    }),
    [
      { name: '@codaco/studio-contract', from: '0.2.0', to: '0.3.0' },
      { name: '@codaco/studio-web', from: '1.0.0', to: '1.1.0' },
    ],
  );
  assert.deepEqual(
    movedWithoutApi({
      current: versions('1.0.1', '1.1.0'),
      baseline: versions('1.0.0', '1.0.0'),
    }),
    [],
  );
});

test('the newest migration is the last NNNN_slug directory', () => {
  const real = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}_/.test(entry.name))
    .map((entry) => entry.name)
    .toSorted()
    .at(-1);
  assert.equal(newestMigration(), real);
});

const manifest = (overrides = {}) =>
  releaseManifest({
    version: '1.2.0',
    date: '2026-10-22T12:00:00Z',
    repository: 'complexdatacollective/network-canvas-monorepo',
    migration: '0005_session_finish',
    commit: COMMIT,
    apiDigest: API_DIGEST,
    webDigest: WEB_DIGEST,
    ...overrides,
  });

test('studio-release.json names the release, its commit and both images by digest', () => {
  assert.deepEqual(manifest(), {
    version: '1.2.0',
    date: '2026-10-22T12:00:00Z',
    notes:
      'https://github.com/complexdatacollective/network-canvas-monorepo/releases/tag/studio@1.2.0',
    migration: '0005_session_finish',
    tag: 'studio@1.2.0',
    commit: COMMIT,
    images: {
      api: `ghcr.io/complexdatacollective/studio-api@${API_DIGEST}`,
      web: `ghcr.io/complexdatacollective/studio-web@${WEB_DIGEST}`,
    },
  });
  assert.throws(() => manifest({ apiDigest: 'latest' }), /not an image digest/);
  assert.throws(() => manifest({ commit: 'abc123' }), /full commit sha/);
  assert.throws(() => manifest({ version: '1.2' }), /not x\.y\.z/);
  assert.throws(
    () => manifest({ date: '2026-10-22T12:00:00.123Z' }),
    /UTC instant/,
  );
});

test('studio-release.json is a release manifest the update check accepts', () => {
  const read = Effect.runSync(
    Schema.decodeUnknownEffect(ReleaseManifest)(manifest()),
  );
  assert.deepEqual(read, {
    version: '1.2.0',
    date: '2026-10-22T12:00:00Z',
    notes:
      'https://github.com/complexdatacollective/network-canvas-monorepo/releases/tag/studio@1.2.0',
    migration: '0005_session_finish',
  });
});

function changelogRoot(changelogs) {
  const root = mkdtempSync(join(tmpdir(), 'studio-release-notes-'));
  for (const [name, text] of Object.entries(changelogs)) {
    const dir = join(root, GATED_PRODUCT_DIRS[name]);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'CHANGELOG.md'), text);
  }
  return root;
}

const CHANGELOGS = {
  '@codaco/studio-api':
    '# @codaco/studio-api\n\n## 1.2.0\n\n### Minor Changes\n\n- Api two.\n\n## 1.1.0\n\n### Minor Changes\n\n- Api one.\n\n## 1.0.0\n\n- Api zero.\n',
  '@codaco/studio-web':
    '# @codaco/studio-web\n\n## 2.0.0\n\n### Major Changes\n\n- Web two.\n\n## 1.0.0\n\n- Web zero.\n',
};

test('the release notes pin both images and carry what moved since the previous release', () => {
  const root = changelogRoot(CHANGELOGS);
  try {
    const body = studioReleaseNotes({
      root,
      repository: 'complexdatacollective/network-canvas-monorepo',
      version: '1.2.0',
      current: versions('1.2.0', '2.0.0'),
      atNewest: versions('1.0.0', '1.0.0'),
      apiDigest: API_DIGEST,
      webDigest: WEB_DIGEST,
    });
    assert.match(
      body,
      new RegExp(
        `STUDIO_API_IMAGE=ghcr\\.io/complexdatacollective/studio-api@${API_DIGEST}`,
      ),
    );
    assert.match(
      body,
      new RegExp(
        `STUDIO_WEB_IMAGE=ghcr\\.io/complexdatacollective/studio-web@${WEB_DIGEST}`,
      ),
    );
    assert.match(body, /## @codaco\/studio-api 1\.2\.0\n\n### 1\.2\.0\n/);
    assert.match(body, /### 1\.1\.0\n\n### Minor Changes\n\n- Api one\./);
    assert.ok(
      !body.includes('Api zero'),
      'the released section is not repeated',
    );
    assert.match(body, /## @codaco\/studio-web 2\.0\.0\n\n### Major Changes/);
    assert.ok(!body.includes('Web zero'));
    assert.ok(
      !body.includes('studio-contract'),
      'a package that did not move has no section',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the first release carries every changelog section, since none was released before', () => {
  const root = changelogRoot(CHANGELOGS);
  try {
    const body = studioReleaseNotes({
      root,
      repository: 'complexdatacollective/network-canvas-monorepo',
      version: '1.2.0',
      current: versions('1.2.0', '2.0.0'),
      atNewest: null,
      apiDigest: API_DIGEST,
      webDigest: WEB_DIGEST,
    });
    assert.match(
      body,
      /## @codaco\/studio-api 1\.2\.0\n\n### 1\.2\.0\n\n### Minor Changes\n\n- Api two\./,
    );
    assert.match(body, /### 1\.1\.0\n\n### Minor Changes\n\n- Api one\./);
    assert.match(body, /### 1\.0\.0\n\n- Api zero\./);
    assert.match(body, /## @codaco\/studio-web 2\.0\.0\n\n### 2\.0\.0\n/);
    assert.match(body, /### 1\.0\.0\n\n- Web zero\./);
    assert.match(body, /## @codaco\/studio-contract 0\.2\.0\n\n0\.2\.0\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('notes too long for a GitHub release link each changelog at the tag instead', () => {
  const huge = `- ${'x'.repeat(RELEASE_BODY_LIMIT)}\n`;
  const root = changelogRoot({
    '@codaco/studio-api': `# @codaco/studio-api\n\n## 1.2.0\n\n${huge}`,
  });
  try {
    const body = studioReleaseNotes({
      root,
      repository: 'complexdatacollective/network-canvas-monorepo',
      version: '1.2.0',
      current: versions('1.2.0', '1.0.0'),
      atNewest: versions('1.1.0', '1.0.0'),
      apiDigest: API_DIGEST,
      webDigest: WEB_DIGEST,
    });
    assert.ok(body.length <= RELEASE_BODY_LIMIT);
    assert.match(body, /STUDIO_API_IMAGE=/);
    assert.match(
      body,
      /## @codaco\/studio-api 1\.2\.0\n\n1\.1\.0 → 1\.2\.0\. See \[its changelog\]\(https:\/\/github\.com\/complexdatacollective\/network-canvas-monorepo\/blob\/studio@1\.2\.0\/apps\/studio\/api\/CHANGELOG\.md\)\./,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const bom = ({ described, components, dependencies = [], tool }) => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  metadata: { tools: { components: [tool] }, component: described },
  components,
  dependencies,
});

test('one SBOM per image keeps each component once and every edge pointing at it', () => {
  const syft = { type: 'application', name: 'syft', version: '1.54.1' };
  const pnpm = { type: 'application', name: 'pnpm', version: '11.20.0' };
  const amd64 = bom({
    tool: syft,
    described: { 'bom-ref': 'scan-amd64', 'type': 'container', 'name': 'x' },
    components: [
      {
        'bom-ref': 'pkg:deb/debian/libc6@2.41?arch=amd64&package-id=1',
        'purl': 'pkg:deb/debian/libc6@2.41?arch=amd64',
        'name': 'libc6',
      },
      {
        'bom-ref': 'pkg:npm/effect@4.0.0?package-id=2',
        'purl': 'pkg:npm/effect@4.0.0',
        'name': 'effect',
      },
    ],
    dependencies: [
      {
        ref: 'scan-amd64',
        dependsOn: ['pkg:deb/debian/libc6@2.41?arch=amd64&package-id=1'],
      },
    ],
  });
  const arm64 = bom({
    tool: syft,
    described: { 'bom-ref': 'scan-arm64', 'type': 'container', 'name': 'x' },
    components: [
      {
        'bom-ref': 'pkg:deb/debian/libc6@2.41?arch=arm64&package-id=3',
        'purl': 'pkg:deb/debian/libc6@2.41?arch=arm64',
        'name': 'libc6',
      },
      {
        'bom-ref': 'pkg:npm/effect@4.0.0?package-id=4',
        'purl': 'pkg:npm/effect@4.0.0',
        'name': 'effect',
      },
    ],
  });
  const lockfile = bom({
    tool: pnpm,
    described: {
      'bom-ref': 'pkg:npm/%40codaco/studio-api@1.2.0',
      'purl': 'pkg:npm/%40codaco/studio-api@1.2.0',
      'type': 'library',
      'name': 'studio-api',
    },
    components: [
      {
        'bom-ref': 'pkg:npm/effect@4.0.0',
        'purl': 'pkg:npm/effect@4.0.0',
        'name': 'effect',
      },
    ],
    dependencies: [
      {
        ref: 'pkg:npm/%40codaco/studio-api@1.2.0',
        dependsOn: ['pkg:npm/effect@4.0.0'],
      },
    ],
  });

  const merged = mergeSboms({
    image: 'api',
    version: '1.2.0',
    digest: API_DIGEST,
    boms: [amd64, arm64, lockfile],
    timestamp: '2026-10-22T12:00:00.000Z',
  });

  const root = `ghcr.io/complexdatacollective/studio-api@${API_DIGEST}`;
  assert.equal(merged.bomFormat, 'CycloneDX');
  assert.equal(merged.specVersion, '1.6');
  assert.match(merged.serialNumber, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.deepEqual(merged.metadata.component, {
    'bom-ref': root,
    'type': 'container',
    'name': 'ghcr.io/complexdatacollective/studio-api',
    'version': '1.2.0',
    'purl': `pkg:oci/studio-api@sha256%3A${'a'.repeat(64)}?repository_url=ghcr.io%2Fcomplexdatacollective%2Fstudio-api`,
  });
  assert.deepEqual(
    merged.metadata.tools.components.map(({ name }) => name),
    ['syft', 'pnpm'],
  );
  assert.deepEqual(
    merged.components.map((component) => component['bom-ref']),
    [
      'pkg:deb/debian/libc6@2.41?arch=amd64&package-id=1',
      'pkg:npm/effect@4.0.0?package-id=2',
      'pkg:deb/debian/libc6@2.41?arch=arm64&package-id=3',
      'pkg:npm/%40codaco/studio-api@1.2.0',
    ],
    'each platform keeps its own OS packages; the npm package both list is kept once',
  );
  assert.deepEqual(merged.dependencies, [
    {
      ref: root,
      dependsOn: [
        'pkg:deb/debian/libc6@2.41?arch=amd64&package-id=1',
        'pkg:npm/%40codaco/studio-api@1.2.0',
      ],
    },
    {
      ref: 'pkg:npm/%40codaco/studio-api@1.2.0',
      dependsOn: ['pkg:npm/effect@4.0.0?package-id=2'],
    },
  ]);
  assert.throws(
    () =>
      mergeSboms({
        image: 'api',
        version: '1.2.0',
        digest: API_DIGEST,
        boms: [{ bomFormat: 'SPDX' }],
        timestamp: '2026-10-22T12:00:00.000Z',
      }),
    /CycloneDX/,
  );
});

test('each bundled module is attributed to the package that owns it', () => {
  const manifests = {
    '/repo/apps/studio/web': { name: '@codaco/studio-web', version: '0.4.0' },
    '/repo/packages/fresco-ui': { name: '@codaco/fresco-ui', version: '8.1.0' },
    '/repo/packages/fresco-ui/src/dist': { type: 'module' },
    '/repo/node_modules/.pnpm/react@19.3.0/node_modules/react': {
      name: 'react',
      version: '19.3.0',
    },
  };
  assert.deepEqual(
    bundledPackages(
      [
        '/repo/apps/studio/web/src/main.tsx',
        '/repo/packages/fresco-ui/src/dist/Button.js?used',
        '/repo/node_modules/.pnpm/react@19.3.0/node_modules/react/cjs/react.production.js',
        '/repo/node_modules/.pnpm/react@19.3.0/node_modules/react/index.js',
        '\0commonjsHelpers.js',
        'vite/modulepreload-polyfill.js',
        '/elsewhere/orphan.js',
      ],
      (dir) => manifests[dir] ?? null,
    ),
    [
      'pkg:npm/%40codaco/fresco-ui@8.1.0',
      'pkg:npm/%40codaco/studio-web@0.4.0',
      'pkg:npm/react@19.3.0',
    ],
  );
});

test('the web SBOM marks what its bundle carries as runtime, and the rest of its lockfile view as build-only', () => {
  const scan = bom({
    tool: { type: 'application', name: 'syft', version: '1.54.1' },
    described: { 'bom-ref': 'scan', 'type': 'container', 'name': 'x' },
    components: [
      {
        'bom-ref': 'pkg:apk/alpine/nginx@1.29.0?package-id=1',
        'purl': 'pkg:apk/alpine/nginx@1.29.0',
        'name': 'nginx',
      },
      {
        'bom-ref': 'pkg:npm/in-image@1.0.0?package-id=2',
        'purl': 'pkg:npm/in-image@1.0.0',
        'name': 'in-image',
      },
    ],
  });
  const lockfile = bom({
    tool: { type: 'application', name: 'pnpm', version: '11.20.0' },
    described: {
      'bom-ref': 'pkg:npm/%40codaco/studio-web@0.4.0',
      'purl': 'pkg:npm/%40codaco/studio-web@0.4.0',
      'type': 'application',
      'name': 'studio-web',
    },
    components: [
      {
        'bom-ref': 'pkg:npm/%40codaco/fresco-ui@8.1.0',
        'purl': 'pkg:npm/%40codaco/fresco-ui@8.1.0',
        'name': 'fresco-ui',
        'scope': 'excluded',
      },
      {
        'bom-ref': 'pkg:npm/vite@8.3.1',
        'purl': 'pkg:npm/vite@8.3.1',
        'name': 'vite',
      },
    ],
  });

  const merged = mergeSboms({
    image: 'web',
    version: '0.4.0',
    digest: WEB_DIGEST,
    boms: [scan, lockfile],
    timestamp: '2026-10-22T12:00:00.000Z',
    runtime: [
      'pkg:npm/%40codaco/fresco-ui@8.1.0',
      'pkg:npm/%40codaco/studio-web@0.4.0',
      'pkg:npm/%40scope/unlisted@2.0.0',
    ],
  });

  const scopes = Object.fromEntries(
    merged.components.map((component) => [
      component['bom-ref'],
      component.scope,
    ]),
  );
  assert.deepEqual(scopes, {
    'pkg:apk/alpine/nginx@1.29.0?package-id=1': undefined,
    'pkg:npm/in-image@1.0.0?package-id=2': 'required',
    'pkg:npm/%40codaco/studio-web@0.4.0': 'required',
    'pkg:npm/%40codaco/fresco-ui@8.1.0': 'required',
    'pkg:npm/vite@8.3.1': 'excluded',
    'pkg:npm/%40scope/unlisted@2.0.0': 'required',
  });
  assert.deepEqual(
    merged.components.find(
      ({ purl }) => purl === 'pkg:npm/%40scope/unlisted@2.0.0',
    ),
    {
      'bom-ref': 'pkg:npm/%40scope/unlisted@2.0.0',
      'type': 'library',
      'name': '@scope/unlisted',
      'version': '2.0.0',
      'purl': 'pkg:npm/%40scope/unlisted@2.0.0',
      'scope': 'required',
    },
  );
  assert.ok(
    merged.dependencies
      .find(({ ref }) => ref === merged.metadata.component['bom-ref'])
      .dependsOn.includes('pkg:npm/%40scope/unlisted@2.0.0'),
  );
});

test('each image attests a reference to its SBOM, small enough for the public transparency log', () => {
  const sbom = JSON.stringify({
    components: Array(50_000).fill({ name: 'x' }),
  });
  const reference = sbomReference({
    repository: 'complexdatacollective/network-canvas-monorepo',
    version: '1.2.0',
    name: 'studio-api.cdx.json',
    bytes: Buffer.from(sbom),
  });
  assert.deepEqual(reference, {
    sbom: {
      name: 'studio-api.cdx.json',
      uri: 'https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/studio@1.2.0/studio-api.cdx.json',
      mediaType: 'application/vnd.cyclonedx+json',
      digest: {
        sha256: createHash('sha256').update(sbom).digest('hex'),
      },
    },
  });
  assert.ok(sbom.length > 100_000);
  assert.ok(JSON.stringify(reference).length < 1_000);
  assert.match(SBOM_REFERENCE_TYPE, /^https:\/\//);
});

test('the bundle command lists the packages the studio-web build bundles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-release-bundle-'));
  try {
    const out = join(dir, 'bundle.json');
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'bundle', '--out', out],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const purls = JSON.parse(readFileSync(out, 'utf8'));
    const names = new Set(purls.map((purl) => purl.replace(/@[^@]+$/, '')));
    for (const shipped of [
      'pkg:npm/%40codaco/studio-web',
      'pkg:npm/%40codaco/fresco-ui',
      'pkg:npm/react',
      'pkg:npm/effect',
    ]) {
      assert.ok(names.has(shipped), `${shipped} is bundled`);
    }
    for (const tool of [
      'pkg:npm/vite',
      'pkg:npm/vitest',
      'pkg:npm/typescript',
    ]) {
      assert.ok(!names.has(tool), `${tool} is not bundled`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A repository holding the four Studio manifests, committed once at `base`
 * versions and again at `head` versions, with `tags` on the first commit.
 */
function studioRepo({ base, head, tags = [] }) {
  const repo = mkdtempSync(join(tmpdir(), 'studio-release-'));
  const git = (...args) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  const write = (set) => {
    for (const [name, version] of Object.entries(set)) {
      const file = join(repo, GATED_PRODUCT_DIRS[name], 'package.json');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ name, version }));
    }
  };
  git('init', '-q');
  git('config', 'user.email', 'ci@example.org');
  git('config', 'user.name', 'CI');
  write(base);
  git('add', '-A');
  git('commit', '-qm', 'base');
  for (const tag of tags) git('tag', tag);
  write(head);
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'head');
  return repo;
}

function run(repo, ...args) {
  const output = join(repo, 'github-output');
  writeFileSync(output, '');
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, STUDIO_RELEASE_ROOT: repo, GITHUB_OUTPUT: output },
  });
  return { ...result, outputs: readFileSync(output, 'utf8') };
}

test('plan reads the versions and tags of the checkout it runs in', () => {
  const first = studioRepo({
    base: versions('0.3.0', '0.3.0'),
    head: versions('0.4.0', '0.3.0'),
  });
  const unmoved = studioRepo({
    base: versions('0.3.0', '0.3.0'),
    head: versions('0.3.0', '0.4.0'),
  });
  const next = studioRepo({
    base: versions('1.0.0', '1.0.0'),
    head: versions('1.1.0', '1.0.0'),
    tags: ['studio@1.0.0'],
  });
  const later = studioRepo({
    base: versions('1.1.0', '1.0.0'),
    head: versions('1.1.0', '1.0.1'),
    tags: ['studio@1.0.0'],
  });
  try {
    const released = run(first, 'plan');
    assert.equal(released.status, 0, released.stderr);
    assert.equal(released.outputs, 'released=true\nversion=0.4.0\n');
    assert.equal(
      run(unmoved, 'plan').outputs,
      'released=false\nversion=0.3.0\n',
    );
    assert.equal(run(next, 'plan').outputs, 'released=true\nversion=1.1.0\n');
    assert.equal(
      run(later, 'plan').outputs,
      'released=false\nversion=1.1.0\n',
      'a push after an untagged release does not publish its own tree under that version',
    );
  } finally {
    for (const repo of [first, unmoved, next, later]) {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test('check fails a tree whose Studio packages moved past the newest release without studio-api', () => {
  const stuck = studioRepo({
    base: versions('1.0.0', '1.0.0'),
    head: versions('1.0.0', '1.1.0'),
    tags: ['studio@1.0.0'],
  });
  const moving = studioRepo({
    base: versions('1.0.0', '1.0.0'),
    head: versions('1.0.1', '1.1.0'),
    tags: ['studio@1.0.0'],
  });
  try {
    const refused = run(stuck, 'check');
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /::error::@codaco\/studio-web moves from 1\.0\.0 to 1\.1\.0, but @codaco\/studio-api stays at 1\.0\.0/,
    );
    const passed = run(moving, 'check');
    assert.equal(passed.status, 0, passed.stderr);
  } finally {
    for (const repo of [stuck, moving]) {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test('before the first release, check compares the release PR with its base', () => {
  const stuck = studioRepo({
    base: versions('0.3.0', '0.3.0'),
    head: versions('0.3.0', '0.4.0'),
  });
  const moving = studioRepo({
    base: versions('0.3.0', '0.3.0'),
    head: versions('0.4.0', '0.4.0'),
  });
  try {
    const refused = run(stuck, 'check');
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /::error::@codaco\/studio-web moves from 0\.3\.0 to 0\.4\.0, but @codaco\/studio-api stays at 0\.3\.0/,
    );
    const passed = run(moving, 'check');
    assert.equal(passed.status, 0, passed.stderr);
  } finally {
    for (const repo of [stuck, moving]) {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test('the manifest command writes studio-release.json from this checkout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-release-manifest-'));
  try {
    const out = join(dir, 'studio-release.json');
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        'manifest',
        '--version',
        '1.2.0',
        '--commit',
        COMMIT,
        '--repository',
        'complexdatacollective/network-canvas-monorepo',
        '--api-digest',
        API_DIGEST,
        '--web-digest',
        WEB_DIGEST,
        '--out',
        out,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(written.migration, newestMigration());
    assert.match(written.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(
      written.images.web,
      `ghcr.io/complexdatacollective/studio-web@${WEB_DIGEST}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
