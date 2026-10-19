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

type SemVer = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const SEMVER =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseSemVer(version: string): SemVer | null {
  const match = SEMVER.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

// Semver precedence: the numeric core first, then a release outranks any of
// its prereleases, then prerelease identifiers left to right (numeric ones
// numerically and below alphanumeric ones; a shorter list ranks lower).
function compareSemVer(a: SemVer, b: SemVer): number {
  const coreDiff = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (coreDiff !== 0) return coreDiff;
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return Number(left) - Number(right);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return left < right ? -1 : 1;
  }
  return 0;
}

// The newest release for this app by version, not by list order. GitHub lists
// releases by creation date, and an older major line keeps releasing after a
// newer one ships (Architect 8 maintenance releases once Architect 9 is out),
// so the first matching entry can be an 8.x patch created after 9.0.0. With
// the running version given, releases on an older major than it are ignored:
// they are never an update for this app, and a newer major still is — that is
// how a running 8.x learns 9.0.0 has arrived.
export function selectLatestForApp(
  app: AppId,
  releases: GitHubRelease[],
  currentVersion?: string,
): ReleaseNotes | null {
  const runningMajor = currentVersion
    ? parseSemVer(currentVersion)?.major
    : undefined;
  let latest: { notes: ReleaseNotes; semver: SemVer } | null = null;
  for (const release of releases) {
    const version = versionFromTag(app, release.tag_name);
    if (!version) continue;
    const semver = parseSemVer(version);
    if (!semver) continue;
    if (runningMajor !== undefined && semver.major < runningMajor) continue;
    if (latest && compareSemVer(semver, latest.semver) <= 0) continue;
    latest = { notes: { version, body: release.body ?? '' }, semver };
  }
  return latest?.notes ?? null;
}

// Every package and app in the monorepo shares one release list, about a
// hundred releases a quarter, so an app's newest release on its newest major
// can sit pages back behind a run of maintenance releases on an older line.
// A few full pages cover several months.
const RELEASES_PER_PAGE = 100;
const RELEASE_PAGES = 3;

export async function fetchLatestReleaseNotes(
  app: AppId,
  currentVersion?: string,
): Promise<ReleaseNotes | null> {
  try {
    const releases: GitHubRelease[] = [];
    for (let page = 1; page <= RELEASE_PAGES; page += 1) {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`,
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (!res.ok) {
        if (page === 1) return null;
        break;
      }
      const batch = (await res.json()) as GitHubRelease[];
      releases.push(...batch);
      if (batch.length < RELEASES_PER_PAGE) break;
    }
    return selectLatestForApp(app, releases, currentVersion);
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
