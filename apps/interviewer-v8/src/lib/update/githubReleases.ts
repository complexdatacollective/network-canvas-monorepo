import { CapacitorHttp } from '@capacitor/core';

import { compareVersions } from './version';

const REPO = 'complexdatacollective/network-canvas-monorepo';
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;

// Interviewer v8 releases are tagged `interviewer-v8@v<version>` in the shared
// monorepo (see .github/workflows/ci-and-release.yml). Other products publish
// to the same repo, so the prefix is how we isolate ours.
const RELEASE_TAG_PREFIX = 'interviewer-v8@v';

export type RemoteRelease = {
  version: string;
  releaseName: string;
  body: string;
  htmlUrl: string;
  publishedAt: string | null;
};

export function parseVersionFromTag(tag: string): string | null {
  if (!tag.startsWith(RELEASE_TAG_PREFIX)) return null;
  const version = tag.slice(RELEASE_TAG_PREFIX.length);
  return version.length > 0 ? version : null;
}

function toRelease(raw: unknown): RemoteRelease | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if ('draft' in raw && raw.draft === true) return null;
  if (!('tag_name' in raw) || typeof raw.tag_name !== 'string') return null;
  const version = parseVersionFromTag(raw.tag_name);
  if (!version) return null;

  const name =
    'name' in raw && typeof raw.name === 'string' && raw.name
      ? raw.name
      : version;
  const body = 'body' in raw && typeof raw.body === 'string' ? raw.body : '';
  const htmlUrl =
    'html_url' in raw && typeof raw.html_url === 'string' ? raw.html_url : '';
  const publishedAt =
    'published_at' in raw && typeof raw.published_at === 'string'
      ? raw.published_at
      : null;

  return { version, releaseName: name, body, htmlUrl, publishedAt };
}

// Capacitor-only: runs through the native HTTP stack so the WebView's
// `connect-src 'self'` CSP and CORS don't apply (mirrors
// `src/lib/files/fetchFromUrl.ts`). Returns the highest-version interviewer-v8
// release, or null if none / on error (the launch check is best-effort).
export async function fetchLatestRelease(): Promise<RemoteRelease | null> {
  let response: { status: number; data: unknown };
  try {
    response = await CapacitorHttp.request({
      url: RELEASES_URL,
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch {
    return null;
  }

  if (response.status < 200 || response.status >= 300) return null;
  if (!Array.isArray(response.data)) return null;

  const releases = response.data
    .map((raw) => toRelease(raw))
    .filter((r): r is RemoteRelease => r !== null);

  if (releases.length === 0) return null;

  return releases.reduce((best, candidate) =>
    compareVersions(candidate.version, best.version) > 0 ? candidate : best,
  );
}
