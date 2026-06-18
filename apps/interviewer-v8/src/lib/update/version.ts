// Minimal semver precedence comparison — `semver` is not a workspace dependency
// and we only need ordering for the launch update check. Follows the semver.org
// precedence rules: numeric major/minor/patch, then prerelease handling where a
// version WITHOUT a prerelease tag outranks one with it, and prerelease
// identifiers compare field-by-field (numeric < alphanumeric). Build metadata
// (after `+`) is ignored. The current app version is itself a prerelease
// (`8.0.0-alpha.0`), so prerelease ordering must be correct.

type ParsedVersion = {
  main: [number, number, number];
  prerelease: string[];
};

function parse(version: string): ParsedVersion | null {
  const withoutBuild = version.trim().replace(/^v/, '').split('+')[0] ?? '';
  const [core, ...prereleaseParts] = withoutBuild.split('-');
  const segments = (core ?? '').split('.');
  if (segments.length !== 3) return null;

  const main = segments.map((s) => Number.parseInt(s, 10));
  if (main.some((n) => Number.isNaN(n))) return null;

  const prerelease =
    prereleaseParts.length > 0 ? prereleaseParts.join('-').split('.') : [];

  return {
    main: [main[0]!, main[1]!, main[2]!],
    prerelease,
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  // A version with no prerelease has higher precedence than one with a
  // prerelease (1.0.0 > 1.0.0-alpha).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const ai = a[i];
    const bi = b[i];
    // A larger set of fields outranks a smaller one when all preceding
    // fields are equal (1.0.0-alpha.1 > 1.0.0-alpha).
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    if (ai === bi) continue;

    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const diff = Number.parseInt(ai, 10) - Number.parseInt(bi, 10);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      continue;
    }
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (aNum) return -1;
    if (bNum) return 1;
    return ai < bi ? -1 : 1;
  }
  return 0;
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  // Unparseable versions sort as equal-to-everything so we never claim an
  // update for a malformed tag.
  if (!pa || !pb) return 0;

  for (let i = 0; i < 3; i++) {
    const diff = pa.main[i]! - pb.main[i]!;
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

export function isNewer(remote: string, current: string): boolean {
  return compareVersions(remote, current) > 0;
}
