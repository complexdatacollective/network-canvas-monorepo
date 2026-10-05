export type AppId = 'architect' | 'interviewer';

export type ReleaseNotes = { version: string; body: string };

type GitHubRelease = { tag_name: string; body: string | null };

const REPO = 'complexdatacollective/network-canvas-monorepo';

const TAG_PREFIX: Record<AppId, string> = {
  architect: '@codaco/architect@',
  interviewer: '@codaco/interviewer@',
};

const cacheKey = (app: AppId) => `nc:updateNotes:${app}`;

const versionFromTag = (app: AppId, tag: string): string | null =>
  tag.startsWith(TAG_PREFIX[app]) ? tag.slice(TAG_PREFIX[app].length) : null;

// GitHub's /releases list is newest-first, so the first tag matching this app is
// the latest release for it.
export function selectLatestForApp(
  app: AppId,
  releases: GitHubRelease[],
): ReleaseNotes | null {
  for (const release of releases) {
    const version = versionFromTag(app, release.tag_name);
    if (version) return { version, body: release.body ?? '' };
  }
  return null;
}

export async function fetchLatestReleaseNotes(
  app: AppId,
): Promise<ReleaseNotes | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=30`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) return null;
    const releases = (await res.json()) as GitHubRelease[];
    return selectLatestForApp(app, releases);
  } catch {
    return null;
  }
}

export async function fetchReleaseNotesForVersion(
  app: AppId,
  version: string,
): Promise<ReleaseNotes | null> {
  try {
    const tag = `${TAG_PREFIX[app]}${version}`;
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) return null;
    const release = (await res.json()) as GitHubRelease;
    return { version, body: release.body ?? '' };
  } catch {
    return null;
  }
}

export function readCachedNotes(app: AppId): ReleaseNotes | null {
  try {
    const raw = localStorage.getItem(cacheKey(app));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReleaseNotes>;
    if (typeof parsed.version === 'string' && typeof parsed.body === 'string') {
      return { version: parsed.version, body: parsed.body };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedNotes(app: AppId, notes: ReleaseNotes): void {
  try {
    localStorage.setItem(cacheKey(app), JSON.stringify(notes));
  } catch {
    // Notes are a nicety, not critical — ignore quota/serialization failures.
  }
}
