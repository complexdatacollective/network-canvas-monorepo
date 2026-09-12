import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { onTestFinished, test } from 'vitest';

import {
  classifyLanePackages,
  lanePackages,
} from './check-first-publications.mjs';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  'check-first-publications.mjs',
);

// A workspace with every kind of member the predicate must tell apart: a
// published public package, a public package nobody has published yet (the
// @codaco/app-i18n case of 2026-09-08), a private package, and a public
// package in the changeset ignore list (a separately gated product).
function fixture({ changesets = {} } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'first-publications-'));
  onTestFinished(() => rmSync(repoRoot, { recursive: true, force: true }));
  writeFileSync(
    join(repoRoot, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  mkdirSync(join(repoRoot, '.changeset'));
  writeFileSync(
    join(repoRoot, '.changeset', 'config.json'),
    JSON.stringify({ ignore: ['@codaco/studio-client'] }),
  );
  writeFileSync(join(repoRoot, '.changeset', 'README.md'), 'readme');
  for (const [name, body] of Object.entries(changesets)) {
    writeFileSync(join(repoRoot, '.changeset', name), body);
  }
  const manifests = {
    'established': { name: '@codaco/established', version: '1.2.0' },
    'app-i18n': { name: '@codaco/app-i18n', version: '0.1.0' },
    'internal': { name: '@codaco/internal', version: '0.0.1', private: true },
    'studio': { name: '@codaco/studio-client', version: '0.3.0' },
  };
  for (const [dir, manifest] of Object.entries(manifests)) {
    mkdirSync(join(repoRoot, 'packages', dir), { recursive: true });
    writeFileSync(
      join(repoRoot, 'packages', dir, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  return repoRoot;
}

// An npm registry that knows @codaco/established (at 1.1.0 only) and nothing
// else; answers on 127.0.0.1 so the CLI's fetch goes nowhere near npm.
function registry() {
  const requested = [];
  const server = createServer((req, res) => {
    requested.push(decodeURIComponent(req.url.slice(1)));
    if (req.url === '/@codaco%2Festablished') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          name: '@codaco/established',
          versions: { '1.1.0': {} },
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  onTestFinished(() => server.close());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        requested,
      });
    });
  });
}

// A response entry is either one answer for every request to that URL, or
// `{ abbreviated, full }` — one answer for the install-time (abbreviated)
// document and another for the full one, telling the two `accept` headers
// apart. `calls` records each request as `<url>` or `<url> (full)`.
function stubFetch(responses, calls = []) {
  return async (url, init) => {
    const accept = init?.headers?.accept ?? '';
    const abbreviated = accept.includes('application/vnd.npm.install-v1+json');
    calls.push(abbreviated ? String(url) : `${url} (full)`);
    let response = responses[String(url)];
    if (
      response !== undefined &&
      ('abbreviated' in response || 'full' in response)
    ) {
      response = abbreviated ? response.abbreviated : response.full;
    }
    if (response === undefined) throw new Error(`unexpected fetch ${url}`);
    if (response instanceof Error) throw response;
    return {
      status: response.status,
      json: async () => {
        if (response.body === undefined) throw new Error('no body');
        return response.body;
      },
    };
  };
}

// Asynchronous on purpose: the registry stub above lives in this process, and
// a synchronous spawn would block the event loop it answers from.
function run(cwd, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('lane packages are the public workspace packages outside the ignore list', () => {
  const repoRoot = fixture();
  assert.deepEqual(lanePackages(repoRoot), [
    { name: '@codaco/app-i18n', version: '0.1.0', dir: 'packages/app-i18n' },
    {
      name: '@codaco/established',
      version: '1.2.0',
      dir: 'packages/established',
    },
  ]);
});

test('a package npm has never heard of is reported, a known one with a pending version is not', async () => {
  const calls = [];
  const fetchImpl = stubFetch(
    {
      'https://registry.npmjs.org/@codaco%2Fapp-i18n': { status: 404 },
      'https://registry.npmjs.org/@codaco%2Festablished': {
        status: 200,
        body: { versions: { '1.1.0': {} } },
      },
    },
    calls,
  );
  const result = await classifyLanePackages(
    [
      { name: '@codaco/app-i18n', version: '0.1.0', dir: 'packages/app-i18n' },
      {
        name: '@codaco/established',
        version: '1.2.0',
        dir: 'packages/established',
      },
    ],
    { fetchImpl },
  );
  assert.deepEqual(
    result.neverPublished.map((pkg) => pkg.name),
    ['@codaco/app-i18n'],
  );
  assert.deepEqual(
    result.pendingVersions.map((pkg) => `${pkg.name}@${pkg.version}`),
    ['@codaco/established@1.2.0'],
  );
  // The scoped name is one registry path segment, and a 404 is only trusted
  // once the full document repeats it.
  assert.deepEqual(calls, [
    'https://registry.npmjs.org/@codaco%2Fapp-i18n',
    'https://registry.npmjs.org/@codaco%2Fapp-i18n (full)',
    'https://registry.npmjs.org/@codaco%2Festablished',
  ]);
});

test('a package whose abbreviated document lags its first publication is pending, not unpublished', async () => {
  // npm builds the install-time document asynchronously: minutes after a
  // first publication the abbreviated route still answers 404 while the full
  // document lists the version. The guard must read the full document before
  // calling the package unpublished, or it refuses the merge that the hand
  // publication just unblocked.
  const calls = [];
  const url = 'https://registry.npmjs.org/@codaco%2Fapp-i18n';
  const fetchImpl = stubFetch(
    {
      [url]: {
        abbreviated: { status: 404 },
        full: { status: 200, body: { versions: { '0.1.0': {} } } },
      },
    },
    calls,
  );
  const result = await classifyLanePackages(
    [{ name: '@codaco/app-i18n', version: '0.1.1', dir: 'packages/app-i18n' }],
    { fetchImpl },
  );
  assert.deepEqual(result.neverPublished, []);
  assert.deepEqual(
    result.pendingVersions.map((pkg) => `${pkg.name}@${pkg.version}`),
    ['@codaco/app-i18n@0.1.1'],
  );
  assert.deepEqual(calls, [url, `${url} (full)`]);

  // Once the lagging document catches up the full document is never asked for.
  const settled = [];
  await classifyLanePackages(
    [{ name: '@codaco/app-i18n', version: '0.1.0', dir: 'packages/app-i18n' }],
    {
      fetchImpl: stubFetch(
        { [url]: { status: 200, body: { versions: { '0.1.0': {} } } } },
        settled,
      ),
    },
  );
  assert.deepEqual(settled, [url]);
});

test('a version npm already has is neither pending nor a first publication', async () => {
  const fetchImpl = stubFetch({
    'https://registry.npmjs.org/@codaco%2Festablished': {
      status: 200,
      body: { versions: { '1.1.0': {}, '1.2.0': {} } },
    },
  });
  const result = await classifyLanePackages(
    [
      {
        name: '@codaco/established',
        version: '1.2.0',
        dir: 'packages/established',
      },
    ],
    { fetchImpl },
  );
  assert.deepEqual(result, { neverPublished: [], pendingVersions: [] });
});

test('anything short of a definite answer from npm is a refusal', async () => {
  const pkg = {
    name: '@codaco/established',
    version: '1.2.0',
    dir: 'packages/established',
  };
  const url = 'https://registry.npmjs.org/@codaco%2Festablished';
  await assert.rejects(
    classifyLanePackages([pkg], {
      fetchImpl: stubFetch({ [url]: { status: 503 } }),
    }),
    /Could not verify @codaco\/established against npm: registry returned HTTP 503/,
  );
  await assert.rejects(
    classifyLanePackages([pkg], {
      fetchImpl: stubFetch({ [url]: new Error('ECONNRESET') }),
    }),
    /Could not verify @codaco\/established against npm: ECONNRESET/,
  );
  await assert.rejects(
    classifyLanePackages([pkg], {
      fetchImpl: stubFetch({ [url]: { status: 200, body: { name: 'x' } } }),
    }),
    /registry metadata lists no versions/,
  );
});

test('the CLI refuses a tree whose publish needs a package npm does not know', async () => {
  const repoRoot = fixture();
  const { url, requested } = await registry();
  const result = await run(repoRoot, [], { NPM_REGISTRY_URL: url });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stderr,
    /@codaco\/app-i18n@0\.1\.0 {2}\(packages\/app-i18n\)/,
  );
  assert.match(result.stderr, /trusted publishing/);
  assert.match(result.stderr, /First publications are made by hand/);
  // Private and ignored-lane packages are never looked up, and the missing
  // package is asked for twice: the abbreviated document, then the full one.
  assert.deepEqual(requested.toSorted(), [
    '@codaco/app-i18n',
    '@codaco/app-i18n',
    '@codaco/established',
  ]);
});

test('the CLI passes once npm knows every lane package, naming what the publish adds', async () => {
  const repoRoot = fixture();
  rmSync(join(repoRoot, 'packages', 'app-i18n'), { recursive: true });
  const { url } = await registry();
  const result = await run(repoRoot, [], { NPM_REGISTRY_URL: url });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /npm knows every package the lane publishes \(1\)\. The next publish run adds: @codaco\/established@1\.2\.0/,
  );
});

test('--publish-path-only leaves a version-PR run alone without consulting npm', async () => {
  const repoRoot = fixture({
    changesets: {
      'pending.md': `---\n"@codaco/established": minor\n---\n\nsomething`,
    },
  });
  // An unreachable registry: the only way this passes is by not fetching.
  const result = await run(repoRoot, ['--publish-path-only'], {
    NPM_REGISTRY_URL: 'http://127.0.0.1:1/',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /1 normal-lane changeset\(s\) pending/);
});

test('--publish-path-only still checks when only ignored-lane changesets remain', async () => {
  const repoRoot = fixture({
    changesets: {
      'studio.md': `---\n"@codaco/studio-client": minor\n---\n\nstudio`,
    },
  });
  const { url } = await registry();
  const result = await run(repoRoot, ['--publish-path-only'], {
    NPM_REGISTRY_URL: url,
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /@codaco\/app-i18n@0\.1\.0/);
});

test('the CLI fails closed when npm cannot be reached', async () => {
  const repoRoot = fixture();
  const result = await run(repoRoot, [], {
    NPM_REGISTRY_URL: 'http://127.0.0.1:1/',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Could not verify @codaco\/app-i18n against npm/);
});

test('the CLI rejects arguments it does not know', async () => {
  const repoRoot = fixture();
  const result = await run(repoRoot, ['--force']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown argument\(s\): --force/);
});
