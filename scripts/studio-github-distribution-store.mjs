import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPOSITORY = 'complexdatacollective/network-canvas-monorepo';
const API = `repos/${REPOSITORY}`;
const ASSET_LIMIT = 64 * 1024 * 1024;
const PAGE_LIMIT = 10;

export class GitHubRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function source(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value))
    throw new Error('A full source commit is required.');
  return value;
}

function tag(value) {
  if (typeof value !== 'string' || !/^studio\/[a-f0-9]{40}$/.test(value))
    throw new Error('Invalid Studio release tag.');
  return value;
}

function manifest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error('Invalid release manifest digest.');
  return value;
}

function assetName(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  )
    throw new Error('Invalid release asset name.');
  return value;
}

function annotation({ source: commit, manifestSha256 }) {
  return `studio-source: ${commit}\nstudio-manifest-sha256: ${manifestSha256}`;
}

function isNotFound(error) {
  return error instanceof GitHubRequestError && error.status === 404;
}

async function ghRequest({
  method = 'GET',
  path,
  query,
  body,
  bytes,
  headers = {},
}) {
  const endpoint = path.startsWith('https://') ? path : `/${path}`;
  const params = query ? new URLSearchParams(query).toString() : '';
  const args = [
    'api',
    '--method',
    method,
    params ? `${endpoint}?${params}` : endpoint,
  ];
  for (const [name, value] of Object.entries(headers))
    args.push('-H', `${name}: ${value}`);
  const input =
    bytes ??
    (body === undefined ? undefined : Buffer.from(JSON.stringify(body)));
  if (input) args.push('--input', '-');
  try {
    const { stdout } = await execFileAsync('gh', args, {
      encoding: 'buffer',
      input,
      maxBuffer: ASSET_LIMIT + 1024 * 1024,
    });
    return { bytes: Buffer.from(stdout), status: 200 };
  } catch (error) {
    const text = Buffer.concat([
      Buffer.from(error.stdout ?? ''),
      Buffer.from(error.stderr ?? ''),
    ]).toString();
    const match = /HTTP (\d{3})/.exec(text);
    throw new GitHubRequestError(
      match ? Number(match[1]) : undefined,
      text || 'GitHub CLI request failed.',
    );
  }
}

function json(response, message) {
  try {
    return JSON.parse(response.bytes.toString('utf8'));
  } catch {
    throw new Error(message);
  }
}

/** A fixed-repository GitHub Release store. The request boundary is injectable
 * for deterministic tests; the default executes structured `gh api` arguments. */
export function createGitHubDistributionStore({ request = ghRequest } = {}) {
  async function requestJson(options, message) {
    return json(await request(options), message);
  }

  async function findRelease(releaseTag) {
    try {
      return await requestJson(
        { path: `${API}/releases/tags/${encodeURIComponent(releaseTag)}` },
        'Invalid GitHub release response.',
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function readTag(releaseTag) {
    try {
      const ref = await requestJson(
        { path: `${API}/git/ref/tags/${encodeURIComponent(releaseTag)}` },
        'Invalid GitHub tag ref.',
      );
      if (ref.object?.type !== 'tag' || typeof ref.object.sha !== 'string')
        throw new Error('Studio release tag is not annotated.');
      return await requestJson(
        { path: `${API}/git/tags/${ref.object.sha}` },
        'Invalid annotated Studio tag.',
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function verifyTag({
    tag: releaseTag,
    source: commit,
    manifestSha256,
  }) {
    const existing = await readTag(releaseTag);
    if (!existing) return false;
    if (
      existing.object?.type !== 'commit' ||
      existing.object.sha !== commit ||
      existing.tag !== releaseTag ||
      existing.message !== annotation({ source: commit, manifestSha256 })
    )
      throw new Error('Studio release tag has different immutable evidence.');
    return true;
  }

  async function listAssets(release) {
    const assets = [];
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const batch = await requestJson(
        {
          path: `${API}/releases/${release.id}/assets`,
          query: { page, per_page: 100 },
        },
        'Invalid GitHub release asset list.',
      );
      if (!Array.isArray(batch) || batch.length > 100)
        throw new Error('Invalid GitHub release asset list.');
      assets.push(...batch);
      if (batch.length < 100) return assets;
    }
    throw new Error('GitHub release asset pagination exceeded its bound.');
  }

  async function exactRelease({
    tag: releaseTag,
    source: commit,
    manifestSha256,
    create,
  }) {
    const existing = await findRelease(releaseTag);
    if (existing) {
      if (
        existing.tag_name !== releaseTag ||
        existing.target_commitish !== commit ||
        existing.body !== annotation({ source: commit, manifestSha256 })
      )
        throw new Error('GitHub release has different immutable evidence.');
      return existing;
    }
    if (!create) throw new Error('GitHub release does not exist.');
    return requestJson(
      {
        method: 'POST',
        path: `${API}/releases`,
        body: {
          body: annotation({ source: commit, manifestSha256 }),
          draft: true,
          name: releaseTag,
          prerelease: false,
          tag_name: releaseTag,
          target_commitish: commit,
        },
      },
      'Invalid created GitHub release.',
    );
  }

  return {
    async reserve(commit) {
      source(commit);
      const name = `studio-distribution-${commit}`;
      try {
        const ref = await requestJson(
          { path: `${API}/git/ref/tags/${name}` },
          'Invalid distribution reservation.',
        );
        if (ref.object?.type !== 'commit' || ref.object.sha !== commit)
          throw new Error(
            'Distribution reservation belongs to another source.',
          );
      } catch (error) {
        if (!isNotFound(error)) throw error;
        try {
          await requestJson(
            {
              method: 'POST',
              path: `${API}/git/refs`,
              body: { ref: `refs/tags/${name}`, sha: commit },
            },
            'Invalid distribution reservation.',
          );
        } catch (createError) {
          if (!isNotFound(createError) && createError.status !== 422)
            throw createError;
          const ref = await requestJson(
            { path: `${API}/git/ref/tags/${name}` },
            'Invalid distribution reservation.',
          );
          if (ref.object?.type !== 'commit' || ref.object.sha !== commit)
            throw new Error(
              'Distribution reservation belongs to another source.',
              {
                cause: createError,
              },
            );
        }
      }
    },

    async ensureDraft({ tag: releaseTag, source: commit, manifestSha256 }) {
      tag(releaseTag);
      source(commit);
      manifest(manifestSha256);
      if (
        !(await verifyTag({ tag: releaseTag, source: commit, manifestSha256 }))
      ) {
        const profile = await requestJson(
          { path: 'user' },
          'Invalid GitHub user response.',
        );
        if (typeof profile.login !== 'string')
          throw new Error('GitHub user cannot create an annotated tag.');
        const tagObject = await requestJson(
          {
            method: 'POST',
            path: `${API}/git/tags`,
            body: {
              tag: releaseTag,
              message: annotation({ source: commit, manifestSha256 }),
              object: commit,
              type: 'commit',
              tagger: {
                name: profile.login,
                email: `${profile.login}@users.noreply.github.com`,
                date: new Date().toISOString(),
              },
            },
          },
          'Invalid created Studio tag.',
        );
        try {
          await requestJson(
            {
              method: 'POST',
              path: `${API}/git/refs`,
              body: { ref: `refs/tags/${releaseTag}`, sha: tagObject.sha },
            },
            'Invalid Studio tag ref.',
          );
        } catch (error) {
          if (error.status !== 422) throw error;
        }
        await verifyTag({ tag: releaseTag, source: commit, manifestSha256 });
      }
      const release = await exactRelease({
        tag: releaseTag,
        source: commit,
        manifestSha256,
        create: true,
      });
      if (!release.draft && release.published_at === null)
        throw new Error('GitHub release has invalid publication state.');
      return release;
    },

    async readAsset(releaseTag, name) {
      tag(releaseTag);
      assetName(name);
      const release = await findRelease(releaseTag);
      if (!release) return null;
      const matching = (await listAssets(release)).filter(
        (asset) => asset.name === name,
      );
      if (matching.length > 1)
        throw new Error('GitHub release has duplicate asset names.');
      if (!matching.length) return null;
      const response = await request({
        path: `${API}/releases/assets/${matching[0].id}`,
        headers: { Accept: 'application/octet-stream' },
      });
      if (
        !Buffer.isBuffer(response.bytes) ||
        response.bytes.length > ASSET_LIMIT
      )
        throw new Error('Invalid GitHub release asset.');
      return response.bytes;
    },

    async uploadAsset(releaseTag, name, bytes) {
      tag(releaseTag);
      assetName(name);
      if (
        !Buffer.isBuffer(bytes) ||
        !bytes.length ||
        bytes.length > ASSET_LIMIT
      )
        throw new Error('Invalid release asset bytes.');
      const release = await findRelease(releaseTag);
      if (!release) throw new Error('GitHub release does not exist.');
      if ((await listAssets(release)).some((asset) => asset.name === name))
        throw new Error('Refusing to replace an immutable release asset.');
      try {
        await request({
          method: 'POST',
          path: `https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets`,
          query: { name },
          bytes,
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      } catch (error) {
        if (error.status === 422)
          throw new Error('Refusing to replace an immutable release asset.', {
            cause: error,
          });
        throw error;
      }
    },

    async publish({ tag: releaseTag, source: commit, manifestSha256 }) {
      tag(releaseTag);
      source(commit);
      manifest(manifestSha256);
      await verifyTag({ tag: releaseTag, source: commit, manifestSha256 });
      const release = await exactRelease({
        tag: releaseTag,
        source: commit,
        manifestSha256,
        create: false,
      });
      if (!release.draft) return release;
      return requestJson(
        {
          method: 'PATCH',
          path: `${API}/releases/${release.id}`,
          body: { draft: false },
        },
        'Invalid published GitHub release.',
      );
    },
  };
}
