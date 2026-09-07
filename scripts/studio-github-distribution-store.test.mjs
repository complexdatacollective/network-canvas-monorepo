import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
      list.push({ id: next++, name: options.query.name, bytes: options.bytes });
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
  return createGitHubDistributionStore({ request: f.request });
}

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
      { id: 1, name: 'release.json', bytes: Buffer.from('a') },
      { id: 2, name: 'release.json', bytes: Buffer.from('b') },
    );
  await assert.rejects(
    () => distribution.readAsset(tag, 'release.json'),
    /duplicate asset names/,
  );
  f.assets.set(
    release.id,
    Array.from({ length: 1000 }, (_, id) => ({
      id,
      name: `a${id}`,
      bytes: Buffer.from('x'),
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
