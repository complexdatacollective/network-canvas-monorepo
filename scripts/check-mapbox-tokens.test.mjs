import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const GUARD = join(scriptDir, 'check-mapbox-tokens.mjs');
const REPO_ROOT = resolve(scriptDir, '..');

// Tokens are built at runtime from their payload so that no token-shaped
// literal is written into this file: the guard under test scans this file too.
const base64url = (text) =>
  Buffer.from(text)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const token = (prefix, id, signature = 'testsig') =>
  [prefix, base64url(JSON.stringify({ u: 'fixture', a: id })), signature].join(
    '.',
  );

const ALLOWED = token('pk', 'allowedsandboxtoken000');
const FOREIGN_PUBLIC = token('pk', 'someonesstudytoken0000');
const FOREIGN_SECRET = token('sk', 'someonessecrettoken000', 'secretsig');

/** A throwaway git repository whose index holds `files`; archives are zipped. */
async function fixture(files, { untracked = {} } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'mapbox-guard-'));
  execFileSync('git', ['init', '-q'], { cwd });
  const write = async (name, body) => {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      const zip = new JSZip();
      for (const [entry, text] of Object.entries(body)) zip.file(entry, text);
      writeFileSync(
        join(cwd, name),
        await zip.generateAsync({ type: 'nodebuffer' }),
      );
    } else {
      writeFileSync(join(cwd, name), body);
    }
  };
  for (const [name, body] of Object.entries(files)) await write(name, body);
  execFileSync('git', ['add', '-A'], { cwd });
  for (const [name, body] of Object.entries(untracked)) await write(name, body);
  return cwd;
}

function run(cwd, env = { MAPBOX_TOKEN_ALLOWLIST: ALLOWED }) {
  return spawnSync(process.execPath, [GUARD], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// A tree that carries the allowed token both as text and inside an archive,
// which every failing case below builds on so the vacuity guard is satisfied.
const clean = {
  'apps/x/src/token.ts': `export const T = '${ALLOWED}';\n`,
  'packages/p/templates/t/protocol.json': JSON.stringify({
    assetManifest: { k: { type: 'apikey', value: ALLOWED } },
  }),
  'apps/x/e2e/fixtures/all.netcanvas': {
    'protocol.json': JSON.stringify({
      assetManifest: { k: { type: 'apikey', value: ALLOWED } },
    }),
    'assets/logo.png': 'not really a png',
  },
};

test('passes a tree whose only token is the allowed one, in text and inside an archive', async () => {
  const result = run(await fixture(clean));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 tracked files and 1 archives scanned/);
  assert.match(result.stdout, /apps\/x\/src\/token\.ts/);
  assert.match(result.stdout, /apps\/x\/e2e\/fixtures\/all\.netcanvas/);
});

test('fails on a foreign public token in a tracked text file anywhere in the tree', async () => {
  const cwd = await fixture({
    ...clean,
    'docs/notes/scratch.md': `token: ${FOREIGN_PUBLIC} glued-to-text`,
  });
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/notes\/scratch\.md: pk\.eyJ/);
  assert.ok(result.stderr.includes(FOREIGN_PUBLIC), 'names the exact token');
});

test('fails on a secret-shaped token inside a text entry of a tracked archive', async () => {
  const cwd = await fixture({
    ...clean,
    'apps/legacy/integration-tests/data/mock.netcanvas': {
      'protocol.json': '{}',
      'assets/config.json': JSON.stringify({ mapbox: FOREIGN_SECRET }),
    },
  });
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /apps\/legacy\/integration-tests\/data\/mock\.netcanvas: sk\.eyJ/,
  );
});

test('fails when a tracked .netcanvas cannot be opened, instead of skipping it', async () => {
  const cwd = await fixture({
    ...clean,
    'apps/y/e2e/fixtures/broken.netcanvas': Buffer.from('definitely not a zip'),
  });
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /broken\.netcanvas: could not be opened as a zip archive/,
  );
});

test('fails when a tracked .netcanvas has no protocol.json entry', async () => {
  const cwd = await fixture({
    ...clean,
    'apps/y/e2e/fixtures/empty.netcanvas': { 'readme.txt': 'nothing here' },
  });
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /empty\.netcanvas: \.netcanvas archive has no protocol\.json entry/,
  );
});

test('fails, rather than passing vacuously, when the allowed token is found nowhere', async () => {
  const cwd = await fixture({ 'README.md': 'no tokens at all\n' });
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /allowed testing token was not found anywhere/);
});

test('ignores untracked files: only what the commit holds is scanned', async () => {
  const cwd = await fixture(clean, {
    untracked: { 'scratch/local.json': FOREIGN_PUBLIC },
  });
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('passes against this repository with the real allowlist', () => {
  const result = run(REPO_ROOT, {});
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /apps\/architect\/src\/templates\/testingMapboxToken\.ts/,
  );
  assert.match(
    result.stdout,
    /packages\/protocols\/templates\/transnational-networks\/protocol\.json/,
  );
  assert.match(
    result.stdout,
    /apps\/architect\/e2e\/fixtures\/files\/all-interfaces\.netcanvas/,
  );
  assert.match(
    result.stdout,
    /packages\/protocols\/e2e\/silos\/silos_chicago-2026-06-02_17-31\.netcanvas/,
  );
});
