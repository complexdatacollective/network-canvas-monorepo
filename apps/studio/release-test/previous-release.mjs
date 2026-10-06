// Which Studio release is the previous published one, if any (#1901 S-7).
//
//   node apps/studio/release-test/previous-release.mjs
//
// Prints one JSON line: {"status":"none"|"published", "newest", "tags", "detail"}
// and exits 0, or prints why it cannot tell and exits 2. run.sh runs Run C —
// the upgrade from that release to the candidate — whenever the status is
// `published`, and fails the lane if Run C did not run and pass. "Cannot
// tell" is never read as "none".
//
// It asks GHCR's registry API for `complexdatacollective/studio-api`'s tags.
// With GHCR_TOKEN or GITHUB_TOKEN set the question is definitive: the
// registry answers NAME_UNKNOWN for a package that does not exist. Without a
// token only a public package is visible, so a refusal means "nothing public"
// — which is all a developer's machine can know, and is said so. Under CI a
// token is required.

import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const PACKAGE = 'complexdatacollective/studio-api';
const REGISTRY = 'https://ghcr.io';

/** `x.y.z` tags only: `latest`, digests and branch builds are not releases. */
export function newestVersion(tags) {
  const versions = tags
    .filter((tag) => /^\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => ({ tag, parts: tag.split('.').map(Number) }))
    .sort((a, b) => {
      for (let i = 0; i < 3; i += 1) {
        if (a.parts[i] !== b.parts[i]) return b.parts[i] - a.parts[i];
      }
      return 0;
    });
  return versions[0]?.tag ?? null;
}

/**
 * The decision, from the two registry answers. `token` is the token
 * endpoint's status and body; `tags` the tag list's, or null when no token
 * was issued.
 */
export function decide({ authenticated, token, tags }) {
  if (token.status !== 200) {
    if (!authenticated && token.status === 403) {
      return {
        status: 'none',
        newest: null,
        tags: [],
        detail: `no public ${PACKAGE} package (an anonymous query cannot see a private one)`,
      };
    }
    throw new Error(`the GHCR token endpoint answered ${token.status}`);
  }
  if (tags === null) throw new Error('no tag list was fetched');
  const unknown = tags.body?.errors?.some?.(
    (error) => error.code === 'NAME_UNKNOWN',
  );
  if (tags.status === 404 && unknown) {
    return {
      status: 'none',
      newest: null,
      tags: [],
      detail: `${PACKAGE} has never been published`,
    };
  }
  if (tags.status !== 200 || !Array.isArray(tags.body?.tags)) {
    throw new Error(`GHCR answered ${tags.status} for ${PACKAGE}'s tags`);
  }
  const newest = newestVersion(tags.body.tags);
  return newest === null
    ? {
        status: 'none',
        newest: null,
        tags: tags.body.tags,
        detail: `${PACKAGE} carries no x.y.z release tag`,
      }
    : {
        status: 'published',
        newest,
        tags: tags.body.tags,
        detail: `${PACKAGE}:${newest} is the newest release`,
      };
}

async function answer(response) {
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

async function main() {
  const secret = process.env.GHCR_TOKEN || process.env.GITHUB_TOKEN || '';
  const authenticated = secret !== '';
  if (!authenticated && (process.env.CI === 'true' || process.env.CI === '1')) {
    console.error(
      'previous-release.mjs: under CI the query must be authenticated (GITHUB_TOKEN with packages: read); an anonymous one cannot see a private package',
    );
    process.exit(2);
  }
  const headers = authenticated
    ? {
        authorization: `Basic ${Buffer.from(`x-access-token:${secret}`).toString('base64')}`,
      }
    : {};
  const token = await answer(
    await fetch(`${REGISTRY}/token?scope=repository:${PACKAGE}:pull`, {
      headers,
    }),
  );
  const tags =
    token.status === 200 && typeof token.body?.token === 'string'
      ? await answer(
          await fetch(`${REGISTRY}/v2/${PACKAGE}/tags/list`, {
            headers: { authorization: `Bearer ${token.body.token}` },
          }),
        )
      : null;
  console.log(
    JSON.stringify({
      ...decide({ authenticated, token, tags }),
      authenticated,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `previous-release.mjs: cannot tell whether a release is published: ${error.message}`,
    );
    process.exit(2);
  });
}
