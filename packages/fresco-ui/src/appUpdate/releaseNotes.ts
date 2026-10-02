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

export async function fetchLatestGitHubNotes(
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

export async function fetchGitHubNotesForVersion(
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

type FeedAppId = AppId | 'fresco';

type FeedUpdate = {
  versions: Partial<Record<FeedAppId, string>>;
  title: string;
  summary: string;
  details?: string;
};

const UPDATES_FEED_URL = 'https://networkcanvas.com/api/updates.json';

const UPDATES_FEED_SCHEMA_VERSION = 1;

function parseVersion(version: string) {
  const [core = '', prerelease] = version.split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    prerelease,
  };
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === undefined) return 1;
  if (right.prerelease === undefined) return -1;
  return left.prerelease.localeCompare(right.prerelease, 'en', {
    numeric: true,
  });
}

function isFeedUpdate(value: unknown): value is FeedUpdate {
  if (typeof value !== 'object' || value === null) return false;
  const { versions, title, summary, details } = value as Record<
    string,
    unknown
  >;
  return (
    typeof versions === 'object' &&
    versions !== null &&
    Object.values(versions).every((version) => typeof version === 'string') &&
    typeof title === 'string' &&
    typeof summary === 'string' &&
    (details === undefined || typeof details === 'string')
  );
}

export function selectFeedNotes(
  app: FeedAppId,
  updates: readonly FeedUpdate[],
  { after, upTo }: { after?: string; upTo?: string },
): ReleaseNotes | null {
  const matching = updates
    .flatMap((update) => {
      const version = update.versions[app];
      return version ? [{ update, version }] : [];
    })
    .filter(
      ({ version }) =>
        (upTo === undefined || compareVersions(version, upTo) <= 0) &&
        (after === undefined
          ? version === upTo
          : compareVersions(version, after) > 0),
    )
    .toSorted((a, b) => compareVersions(b.version, a.version));

  const newest = matching[0];
  if (!newest) return null;

  return {
    version: newest.version,
    body: matching
      .map(({ update }) =>
        [`### ${update.title}`, update.summary, update.details]
          .filter(Boolean)
          .join('\n\n'),
      )
      .join('\n\n'),
  };
}

export async function fetchFeedNotes(
  app: FeedAppId,
  range: { after?: string; upTo?: string },
): Promise<ReleaseNotes | null> {
  try {
    const res = await fetch(UPDATES_FEED_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const feed = (await res.json()) as {
      schemaVersion?: unknown;
      updates?: unknown;
    };
    if (
      feed.schemaVersion !== UPDATES_FEED_SCHEMA_VERSION ||
      !Array.isArray(feed.updates)
    ) {
      return null;
    }
    return selectFeedNotes(app, feed.updates.filter(isFeedUpdate), range);
  } catch {
    return null;
  }
}

function withGitHubNotes(
  fromGitHub: ReleaseNotes,
  fromFeed: ReleaseNotes,
): ReleaseNotes {
  return {
    version: fromGitHub.version,
    body: `### ${fromGitHub.version}\n\n${fromGitHub.body}\n\n${fromFeed.body}`,
  };
}

export async function fetchLatestReleaseNotes(
  app: AppId,
  currentVersion: string,
): Promise<ReleaseNotes | null> {
  const [fromFeed, fromGitHub] = await Promise.all([
    fetchFeedNotes(app, { after: currentVersion }),
    fetchLatestGitHubNotes(app),
  ]);
  if (!fromFeed) return fromGitHub;
  if (
    !fromGitHub ||
    compareVersions(fromFeed.version, fromGitHub.version) >= 0
  ) {
    return fromFeed;
  }
  return withGitHubNotes(fromGitHub, fromFeed);
}

export async function fetchReleaseNotesForVersion(
  app: AppId,
  version: string,
  previousVersion?: string,
): Promise<ReleaseNotes | null> {
  const after =
    previousVersion && compareVersions(previousVersion, version) < 0
      ? previousVersion
      : undefined;
  const fromFeed = await fetchFeedNotes(app, { after, upTo: version });
  if (fromFeed?.version === version) return fromFeed;
  const fromGitHub = await fetchGitHubNotesForVersion(app, version);
  if (!fromGitHub) return fromFeed;
  return fromFeed ? withGitHubNotes(fromGitHub, fromFeed) : fromGitHub;
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
