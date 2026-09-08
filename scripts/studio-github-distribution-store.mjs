import { spawn } from 'node:child_process';

const REPOSITORY = 'complexdatacollective/network-canvas-monorepo';
const API = `repos/${REPOSITORY}`;
const ASSET_LIMIT = 64 * 1024 * 1024;
const PAGE_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 30_000;
const STDERR_LIMIT = 64 * 1024;
const OUTPUT_LIMIT = ASSET_LIMIT + 1024 * 1024;

export class GitHubRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class ImmutableAssetConflictError extends Error {
  constructor(cause) {
    super('Refusing to replace an immutable release asset.', { cause });
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

function tagger(value) {
  if (
    !value ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.email !== 'string' ||
    !/^[^@\s]+@[^@\s]+$/.test(value.email)
  ) {
    throw new Error('A valid explicit GitHub tagger is required.');
  }
  return { name: value.name, email: value.email };
}

function annotation({ source: commit, manifestSha256 }) {
  return `studio-source: ${commit}\nstudio-manifest-sha256: ${manifestSha256}`;
}

function isNotFound(error) {
  return error instanceof GitHubRequestError && error.status === 404;
}

function splitHttpResponse(bytes) {
  const divider = bytes.indexOf('\r\n\r\n');
  const end = divider === -1 ? bytes.indexOf('\n\n') : divider;
  if (end === -1)
    throw new GitHubRequestError(
      undefined,
      'GitHub CLI returned no HTTP response.',
    );
  const header = bytes.subarray(0, end).toString('utf8');
  const status = /^HTTP\/\S+\s+(\d{3})/m.exec(header)?.[1];
  if (!status)
    throw new GitHubRequestError(
      undefined,
      'GitHub CLI returned an invalid HTTP response.',
    );
  return {
    status: Number(status),
    bytes: bytes.subarray(end + (divider === -1 ? 2 : 4)),
  };
}

export function createGhRequest({
  executable = 'gh',
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Invalid GitHub CLI timeout.');
  return async function ghRequest({
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
      '--include',
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
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const chunks = [];
      let outputSize = 0;
      let stderrSize = 0;
      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const terminate = () => {
        if (!child.pid) return;
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      };
      const timer = setTimeout(() => {
        terminate();
        settle(
          reject,
          new GitHubRequestError(undefined, 'GitHub CLI request timed out.'),
        );
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        outputSize += chunk.length;
        if (outputSize > OUTPUT_LIMIT) {
          terminate();
          settle(
            reject,
            new GitHubRequestError(
              undefined,
              'GitHub CLI response exceeded its bound.',
            ),
          );
        } else chunks.push(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderrSize += chunk.length;
        if (stderrSize > STDERR_LIMIT) {
          terminate();
          settle(
            reject,
            new GitHubRequestError(
              undefined,
              'GitHub CLI stderr exceeded its bound.',
            ),
          );
        }
      });
      child.stdin.on('error', () => {
        terminate();
        settle(
          reject,
          new GitHubRequestError(undefined, 'GitHub CLI stdin failed.'),
        );
      });
      child.on('error', () =>
        settle(
          reject,
          new GitHubRequestError(undefined, 'GitHub CLI process failed.'),
        ),
      );
      child.on('close', (code) => {
        if (settled) return;
        let response;
        try {
          response = splitHttpResponse(Buffer.concat(chunks));
        } catch (error) {
          if (code !== 0)
            settle(
              reject,
              new GitHubRequestError(undefined, 'GitHub CLI process failed.'),
            );
          else settle(reject, error);
          return;
        }
        if (response.status < 200 || response.status >= 300) {
          settle(
            reject,
            new GitHubRequestError(
              response.status,
              'GitHub API request failed.',
            ),
          );
          return;
        }
        if (code !== 0) {
          settle(
            reject,
            new GitHubRequestError(undefined, 'GitHub CLI process failed.'),
          );
          return;
        }
        settle(resolve, response);
      });
      if (input) child.stdin.end(input);
      else child.stdin.end();
    });
  };
}

function json(response, message) {
  try {
    return JSON.parse(response.bytes.toString('utf8'));
  } catch {
    throw new Error(message);
  }
}

function releaseId(release) {
  if (
    !Number.isSafeInteger(release?.id) ||
    release.id <= 0 ||
    typeof release.draft !== 'boolean'
  ) {
    throw new Error('Invalid GitHub release response.');
  }
  if (
    (release.draft && release.published_at !== null) ||
    (!release.draft && typeof release.published_at !== 'string')
  ) {
    throw new Error('GitHub release has invalid publication state.');
  }
  return release.id;
}

/** A fixed-repository GitHub Release store. The request boundary is injectable
 * for deterministic tests; the default executes structured `gh api` arguments. */
export function createGitHubDistributionStore({
  request = createGhRequest(),
  tagger: explicitTagger,
} = {}) {
  const taggerIdentity = tagger(explicitTagger);
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
    let ref;
    try {
      ref = await requestJson(
        { path: `${API}/git/ref/tags/${encodeURIComponent(releaseTag)}` },
        'Invalid GitHub tag ref.',
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    if (ref.object?.type !== 'tag' || typeof ref.object.sha !== 'string')
      throw new Error('Studio release tag is not annotated.');
    return requestJson(
      { path: `${API}/git/tags/${ref.object.sha}` },
      'Invalid annotated Studio tag.',
    );
  }

  function exactTag(releaseTag, commit) {
    tag(releaseTag);
    source(commit);
    if (releaseTag !== `studio/${commit}`)
      throw new Error('Studio release tag does not match its source.');
  }

  async function verifyTag({
    tag: releaseTag,
    source: commit,
    manifestSha256,
  }) {
    exactTag(releaseTag, commit);
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
    const id = releaseId(release);
    const assets = [];
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const batch = await requestJson(
        {
          path: `${API}/releases/${id}/assets`,
          query: { page, per_page: 100 },
        },
        'Invalid GitHub release asset list.',
      );
      if (
        !Array.isArray(batch) ||
        batch.length > 100 ||
        batch.some(
          (asset) =>
            !Number.isSafeInteger(asset?.id) ||
            asset.id <= 0 ||
            typeof asset.name !== 'string' ||
            !Number.isSafeInteger(asset.size) ||
            asset.size < 0 ||
            asset.size > ASSET_LIMIT,
        )
      )
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
    exactTag(releaseTag, commit);
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

  async function readAssetFromRelease(release, name) {
    assetName(name);
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
      response.bytes.length !== matching[0].size ||
      response.bytes.length > ASSET_LIMIT
    )
      throw new Error('Invalid GitHub release asset.');
    return response.bytes;
  }

  async function uploadAssetToRelease(release, name, bytes) {
    assetName(name);
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > ASSET_LIMIT)
      throw new Error('Invalid release asset bytes.');
    if (!release) throw new Error('GitHub release does not exist.');
    if (!release.draft)
      throw new Error('Refusing to upload assets to a published release.');
    if ((await listAssets(release)).some((asset) => asset.name === name))
      throw new ImmutableAssetConflictError();
    try {
      await request({
        method: 'POST',
        path: `https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets`,
        query: { name },
        bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 422)
        throw new ImmutableAssetConflictError(error);
      throw error;
    }
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
      exactTag(releaseTag, commit);
      manifest(manifestSha256);
      if (
        !(await verifyTag({ tag: releaseTag, source: commit, manifestSha256 }))
      ) {
        const tagObject = await requestJson(
          {
            method: 'POST',
            path: `${API}/git/tags`,
            body: {
              tag: releaseTag,
              message: annotation({ source: commit, manifestSha256 }),
              object: commit,
              type: 'commit',
              tagger: { ...taggerIdentity, date: new Date().toISOString() },
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
        if (
          !(await verifyTag({
            tag: releaseTag,
            source: commit,
            manifestSha256,
          }))
        )
          throw new Error('Studio release tag does not exist.');
      }
      const release = await exactRelease({
        tag: releaseTag,
        source: commit,
        manifestSha256,
        create: true,
      });
      releaseId(release);
      return release;
    },

    /** Private build checkpoints use the already-reserved source ref. They do
     * not create a final release tag and have no publication method. Retaining
     * exact signature/SBOM bytes makes a failed workflow resumable on a fresh
     * runner without regenerating non-deterministic evidence. */
    async ensurePreparation({ source: commit, artifactSha256 }) {
      source(commit);
      manifest(artifactSha256);
      const preparationTag = `studio-distribution-${commit}`;
      const description = `studio-preparation: 1\nstudio-source: ${commit}\nstudio-artifact-sha256: ${artifactSha256}`;
      async function retained(create = false) {
        const ref = await requestJson(
          { path: `${API}/git/ref/tags/${preparationTag}` },
          'Invalid preparation reservation.',
        );
        if (ref.object?.type !== 'commit' || ref.object.sha !== commit)
          throw new Error('Preparation reservation belongs to another source.');
        let release = await findRelease(preparationTag);
        if (!release && create) {
          try {
            await requestJson(
              {
                method: 'POST',
                path: `${API}/releases`,
                body: {
                  tag_name: preparationTag,
                  target_commitish: commit,
                  draft: true,
                  prerelease: false,
                  name: `Studio preparation ${commit}`,
                  body: description,
                },
              },
              'Invalid preparation checkpoint.',
            );
          } catch (error) {
            // Another same-source retry can only create the exact same draft.
            if (error.status !== 422) throw error;
          }
          release = await findRelease(preparationTag);
        }
        if (
          !release ||
          release.tag_name !== preparationTag ||
          release.target_commitish !== commit ||
          release.body !== description ||
          release.draft !== true ||
          release.prerelease !== false
        )
          throw new Error(
            'Preparation checkpoint has different immutable evidence.',
          );
        releaseId(release);
        return release;
      }
      await retained(true);
      return {
        async read(name) {
          return readAssetFromRelease(await retained(), name);
        },
        async write(name, bytes) {
          const release = await retained();
          const previous = await readAssetFromRelease(release, name);
          if (previous !== null) {
            if (!Buffer.isBuffer(bytes) || !previous.equals(bytes))
              throw new Error(
                'Preparation checkpoint has different immutable bytes.',
              );
          } else {
            try {
              await uploadAssetToRelease(release, name, bytes);
            } catch (error) {
              // Reconcile only GitHub's immutable-name collision. A concurrent
              // preparation retry succeeds only if its exact bytes won.
              if (!(error instanceof ImmutableAssetConflictError)) throw error;
            }
          }
          const saved = await readAssetFromRelease(await retained(), name);
          if (!Buffer.isBuffer(saved) || !saved.equals(bytes))
            throw new Error('Preparation checkpoint failed exact readback.');
        },
      };
    },

    async readAsset(releaseTag, name) {
      tag(releaseTag);
      return readAssetFromRelease(await findRelease(releaseTag), name);
    },

    async uploadAsset(releaseTag, name, bytes) {
      tag(releaseTag);
      return uploadAssetToRelease(await findRelease(releaseTag), name, bytes);
    },

    async publish({ tag: releaseTag, source: commit, manifestSha256 }) {
      exactTag(releaseTag, commit);
      manifest(manifestSha256);
      if (
        !(await verifyTag({ tag: releaseTag, source: commit, manifestSha256 }))
      )
        throw new Error('Studio release tag does not exist.');
      const release = await exactRelease({
        tag: releaseTag,
        source: commit,
        manifestSha256,
        create: false,
      });
      releaseId(release);
      if (!release.draft) return release;
      const published = await requestJson(
        {
          method: 'PATCH',
          path: `${API}/releases/${release.id}`,
          body: { draft: false },
        },
        'Invalid published GitHub release.',
      );
      if (published.draft) throw new Error('GitHub release remained a draft.');
      releaseId(published);
      return published;
    },
  };
}
