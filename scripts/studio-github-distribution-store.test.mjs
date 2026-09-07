import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createGhRequest,
  createGitHubDistributionStore,
  GitHubRequestError,
} from './studio-github-distribution-store.mjs';

const source = 'a'.repeat(40);
const other = 'b'.repeat(40);
const manifestSha256 = 'c'.repeat(64);
const tag = `studio/${source}`;
const api = 'repos/complexdatacollective/network-canvas-monorepo';

function missing() {
  throw new GitHubRequestError(404, 'HTTP 404 Not Found');
}

function response(value) {
  return { bytes: Buffer.from(JSON.stringify(value)), status: 200 };
}

function fixture() {
  const refs = new Map();
  const tags = new Map();
  const releases = new Map();
  const assets = new Map();
  const calls = [];
  let next = 1;
  const request = async (options) => {
    calls.push(options);
    const method = options.method ?? 'GET';
    const path = options.path;
    const body = options.body;
    if (path === 'user') return response({ login: 'studio-bot' });
    if (method === 'GET' && path.startsWith(`${api}/git/ref/tags/`)) {
      const name = decodeURIComponent(
        path.slice(`${api}/git/ref/tags/`.length),
      );
      if (!refs.has(name)) missing();
      return response({ object: refs.get(name) });
    }
    if (method === 'POST' && path === `${api}/git/refs`) {
      const name = body.ref.slice('refs/tags/'.length);
      if (refs.has(name)) throw new GitHubRequestError(422, 'HTTP 422 exists');
      refs.set(name, {
        sha: body.sha,
        type: name.startsWith('studio/') ? 'tag' : 'commit',
      });
      return response({});
    }
    if (method === 'POST' && path === `${api}/git/tags`) {
      const sha = `tag-${next++}`;
      tags.set(sha, {
        tag: body.tag,
        message: body.message,
        object: { type: body.type, sha: body.object },
      });
      return response({ sha });
    }
    if (method === 'GET' && path.startsWith(`${api}/git/tags/`)) {
      const object = tags.get(path.slice(`${api}/git/tags/`.length));
      if (!object) missing();
      return response(object);
    }
    if (method === 'GET' && path.startsWith(`${api}/releases/tags/`)) {
      const name = decodeURIComponent(
        path.slice(`${api}/releases/tags/`.length),
      );
      if (!releases.has(name)) missing();
      return response(releases.get(name));
    }
    if (method === 'POST' && path === `${api}/releases`) {
      if (releases.has(body.tag_name))
        throw new GitHubRequestError(422, 'HTTP 422 exists');
      const release = { ...body, id: next++, published_at: null };
      releases.set(body.tag_name, release);
      assets.set(release.id, []);
      return response(release);
    }
    if (method === 'GET' && path.match(/\/releases\/\d+\/assets$/)) {
      const id = Number(path.split('/')[4]);
      return response(
        (assets.get(id) ?? []).slice(
          (options.query.page - 1) * 100,
          options.query.page * 100,
        ),
      );
    }
    if (method === 'GET' && path.match(/\/releases\/assets\/\d+$/)) {
      const id = Number(path.split('/').at(-1));
      for (const list of assets.values()) {
        const asset = list.find((item) => item.id === id);
        if (asset) return { bytes: asset.bytes, status: 200 };
      }
      missing();
    }
    if (method === 'POST' && path.startsWith('https://uploads.github.com/')) {
      const id = Number(path.split('/')[7]);
      const list = assets.get(id);
      if (list.some((item) => item.name === options.query.name))
        throw new GitHubRequestError(422, 'HTTP 422 exists');
      list.push({
        id: next++,
        name: options.query.name,
        bytes: options.bytes,
        size: options.bytes.length,
      });
      return response({});
    }
    if (method === 'PATCH' && path.match(/\/releases\/\d+$/)) {
      const id = Number(path.split('/').at(-1));
      const release = [...releases.values()].find((item) => item.id === id);
      Object.assign(release, body, { published_at: '2026-09-07T00:00:00Z' });
      return response(release);
    }
    throw new Error(`Unexpected request ${options.method ?? 'GET'} ${path}`);
  };
  return { assets, calls, refs, releases, request, tags };
}

function store(f) {
  return createGitHubDistributionStore({
    request: f.request,
    tagger: { name: 'Joshua Melville', email: 'joshua@northwestern.edu' },
  });
}

test('does not create a release if its newly written final tag cannot be read back', async () => {
  const f = fixture();
  const request = f.request;
  f.request = async (options) => {
    const result = await request(options);
    if (
      options.method === 'POST' &&
      options.path === `${api}/git/refs` &&
      options.body.ref === `refs/tags/${tag}`
    )
      f.refs.delete(tag);
    return result;
  };
  await assert.rejects(
    () => store(f).ensureDraft({ tag, source, manifestSha256 }),
    /tag does not exist/,
  );
  assert.equal(f.releases.size, 0);
});

test('reserves an immutable distribution ref and verifies exact retries', async () => {
  const f = fixture();
  const distribution = store(f);
  await distribution.reserve(source);
  await distribution.reserve(source);
  assert.deepEqual(f.refs.get(`studio-distribution-${source}`), {
    sha: source,
    type: 'commit',
  });
  f.refs.set(`studio-distribution-${other}`, { sha: source, type: 'commit' });
  await assert.rejects(
    () => distribution.reserve(other),
    /belongs to another source/,
  );
});

test('creates and reconciles an annotated final tag and draft release', async () => {
  const f = fixture();
  const distribution = store(f);
  const release = await distribution.ensureDraft({
    tag,
    source,
    manifestSha256,
  });
  assert.equal(release.draft, true);
  assert.equal(f.tags.size, 1);
  await distribution.ensureDraft({ tag, source, manifestSha256 });
  assert.equal(f.tags.size, 1);
  const [tagObject] = f.tags.values();
  tagObject.object.sha = other;
  await assert.rejects(
    () => distribution.ensureDraft({ tag, source, manifestSha256 }),
    /tag has different immutable evidence/,
  );
  tagObject.object.sha = source;
  f.releases.get(tag).target_commitish = other;
  await assert.rejects(
    () => distribution.ensureDraft({ tag, source, manifestSha256 }),
    /different immutable evidence/,
  );
});

test('returns null only for a conclusive missing release or asset and propagates access errors', async () => {
  const f = fixture();
  const distribution = store(f);
  assert.equal(await distribution.readAsset(tag, 'release.json'), null);
  const denied = createGitHubDistributionStore({
    tagger: { name: 'Joshua Melville', email: 'joshua@northwestern.edu' },
    request: async () => {
      throw new GitHubRequestError(403, 'HTTP 403');
    },
  });
  await assert.rejects(() => denied.readAsset(tag, 'release.json'), /HTTP 403/);
  await distribution.ensureDraft({ tag, source, manifestSha256 });
  assert.equal(await distribution.readAsset(tag, 'release.json'), null);
});

test('resumes a partial upload with exact bytes and never replaces an asset', async () => {
  const f = fixture();
  const distribution = store(f);
  await distribution.ensureDraft({ tag, source, manifestSha256 });
  await distribution.uploadAsset(tag, 'release.json', Buffer.from('one'));
  await distribution.ensureDraft({ tag, source, manifestSha256 });
  await distribution.uploadAsset(tag, 'installer.tar', Buffer.from('two'));
  assert.deepEqual(
    await distribution.readAsset(tag, 'release.json'),
    Buffer.from('one'),
  );
  await assert.rejects(
    () => distribution.uploadAsset(tag, 'release.json', Buffer.from('two')),
    /Refusing to replace/,
  );
  assert.ok(
    !f.calls.some((call) => call.method === 'DELETE' || call.query?.clobber),
  );
});

test('rejects duplicate asset records and bounds paginated asset enumeration', async () => {
  const f = fixture();
  const distribution = store(f);
  const release = await distribution.ensureDraft({
    tag,
    source,
    manifestSha256,
  });
  f.assets
    .get(release.id)
    .push(
      { id: 1, name: 'release.json', bytes: Buffer.from('a'), size: 1 },
      { id: 2, name: 'release.json', bytes: Buffer.from('b'), size: 1 },
    );
  await assert.rejects(
    () => distribution.readAsset(tag, 'release.json'),
    /duplicate asset names/,
  );
  f.assets.set(
    release.id,
    Array.from({ length: 1000 }, (_, id) => ({
      id: id + 1,
      name: `a${id}`,
      bytes: Buffer.from('x'),
      size: 1,
    })),
  );
  await assert.rejects(
    () => distribution.readAsset(tag, 'release.json'),
    /pagination exceeded/,
  );
});

test('publishes only matching evidence and permits matching published retries', async () => {
  const f = fixture();
  const distribution = store(f);
  await distribution.ensureDraft({ tag, source, manifestSha256 });
  const published = await distribution.publish({ tag, source, manifestSha256 });
  assert.equal(published.draft, false);
  await distribution.publish({ tag, source, manifestSha256 });
  await assert.rejects(
    () => distribution.publish({ tag, source, manifestSha256: 'd'.repeat(64) }),
    /different immutable evidence/,
  );
});

test('writes request bytes to the CLI stdin and bounds a stalled CLI', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-gh-fixture-'));
  try {
    const executable = join(directory, 'gh-fixture');
    writeFileSync(
      executable,
      String.raw`#!/usr/bin/env node
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => process.stdout.write('HTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n' + Buffer.concat(chunks)));
`,
    );
    chmodSync(executable, 0o755);
    const request = createGhRequest({ executable, timeoutMs: 2_000 });
    const cliResponse = await request({
      method: 'POST',
      path: 'repos/fixed',
      body: { exact: 'stdin' },
    });
    assert.equal(cliResponse.status, 201);
    assert.deepEqual(JSON.parse(cliResponse.bytes), { exact: 'stdin' });

    const ignored = join(directory, 'gh-ignored-term');
    writeFileSync(
      ignored,
      '#!/usr/bin/env node\nprocess.on("SIGTERM", () => {}); setInterval(() => {}, 1000);\n',
    );
    chmodSync(ignored, 0o755);
    const started = Date.now();
    await assert.rejects(
      () =>
        createGhRequest({ executable: ignored, timeoutMs: 20 })({
          path: 'repos/fixed',
        }),
      /timed out/,
    );
    assert.ok(
      Date.now() - started < 500,
      'ignored SIGTERM must not delay request settlement',
    );

    const nonzero = join(directory, 'gh-nonzero');
    writeFileSync(
      nonzero,
      String.raw`#!/usr/bin/env node
process.stdout.write('HTTP/1.1 200 OK\r\n\r\n{}'); process.exit(1);
`,
    );
    chmodSync(nonzero, 0o755);
    await assert.rejects(
      () =>
        createGhRequest({ executable: nonzero, timeoutMs: 2_000 })({
          path: 'repos/fixed',
        }),
      /process failed/,
    );

    for (const [status, body] of [
      [404, 'missing'],
      [403, 'body says HTTP 404 but status is forbidden'],
      [500, 'server failure'],
    ]) {
      const httpError = join(directory, `gh-${status}`);
      writeFileSync(
        httpError,
        String.raw`#!/usr/bin/env node
process.stdout.write('HTTP/1.1 ${status} Error\r\n\r\n${body}'); process.exit(1);
`,
      );
      chmodSync(httpError, 0o755);
      await assert.rejects(
        () =>
          createGhRequest({ executable: httpError, timeoutMs: 2_000 })({
            path: 'repos/fixed',
          }),
        (error) =>
          error.status === status &&
          error.message === 'GitHub API request failed.',
      );
    }

    const noisy = join(directory, 'gh-noisy');
    writeFileSync(
      noisy,
      '#!/usr/bin/env node\nprocess.stderr.write("x".repeat(65537)); setTimeout(() => {}, 1000);\n',
    );
    chmodSync(noisy, 0o755);
    await assert.rejects(
      () =>
        createGhRequest({ executable: noisy, timeoutMs: 2_000 })({
          path: 'repos/fixed',
        }),
      /stderr exceeded its bound/,
    );

    const closedStdin = join(directory, 'gh-closed-stdin');
    writeFileSync(
      closedStdin,
      '#!/usr/bin/env node\nprocess.stdin.destroy(); setTimeout(() => process.exit(0), 100);\n',
    );
    chmodSync(closedStdin, 0o755);
    await assert.rejects(
      () =>
        createGhRequest({ executable: closedStdin, timeoutMs: 2_000 })({
          path: 'repos/fixed',
          bytes: Buffer.alloc(8 * 1024 * 1024),
        }),
      /stdin failed/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('refuses missing annotated objects, wrong tag/source pairs, malformed IDs, and public uploads', async () => {
  const f = fixture();
  const distribution = store(f);
  f.refs.set(tag, { sha: 'missing-tag-object', type: 'tag' });
  await assert.rejects(
    () => distribution.ensureDraft({ tag, source, manifestSha256 }),
    /HTTP 404 Not Found/,
  );
  await assert.rejects(
    () =>
      distribution.ensureDraft({
        tag: `studio/${other}`,
        source,
        manifestSha256,
      }),
    /does not match its source/,
  );
  f.refs.delete(tag);
  const release = await distribution.ensureDraft({
    tag,
    source,
    manifestSha256,
  });
  f.releases.get(tag).id = 0;
  await assert.rejects(
    () => distribution.readAsset(tag, 'release.json'),
    /Invalid GitHub release response/,
  );
  f.releases.get(tag).id = release.id;
  await distribution.publish({ tag, source, manifestSha256 });
  await assert.rejects(
    () => distribution.uploadAsset(tag, 'release.json', Buffer.from('bytes')),
    /published release/,
  );
});

test('never converts 403 or 500 failures into a conclusive absence', async () => {
  for (const status of [403, 500]) {
    const denied = createGitHubDistributionStore({
      tagger: { name: 'Joshua Melville', email: 'joshua@northwestern.edu' },
      request: async () => {
        throw new GitHubRequestError(status, `HTTP ${status}`);
      },
    });
    await assert.rejects(
      () => denied.readAsset(tag, 'release.json'),
      new RegExp(`HTTP ${status}`),
    );
  }
});
