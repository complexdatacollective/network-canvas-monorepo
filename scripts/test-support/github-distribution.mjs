import { GitHubRequestError } from '../studio-github-distribution-store.mjs';

const api = 'repos/complexdatacollective/network-canvas-monorepo';

function missing() {
  throw new GitHubRequestError(404, 'HTTP 404 Not Found');
}

function response(value) {
  return { bytes: Buffer.from(JSON.stringify(value)), status: 200 };
}

export function githubDistributionFixture() {
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
