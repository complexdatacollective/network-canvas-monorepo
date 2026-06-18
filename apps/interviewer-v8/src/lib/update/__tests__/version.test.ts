import { describe, expect, it } from 'vitest';

import { compareVersions, isNewer } from '../version';

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('8.0.1', '8.0.0')).toBe(1);
    expect(compareVersions('8.1.0', '8.0.9')).toBe(1);
    expect(compareVersions('9.0.0', '8.9.9')).toBe(1);
    expect(compareVersions('8.0.0', '8.0.1')).toBe(-1);
    expect(compareVersions('8.0.0', '8.0.0')).toBe(0);
  });

  it('ranks a release above its prereleases', () => {
    expect(compareVersions('8.0.0', '8.0.0-alpha.0')).toBe(1);
    expect(compareVersions('8.0.0-alpha.0', '8.0.0')).toBe(-1);
  });

  it('orders prerelease identifiers per semver precedence', () => {
    expect(compareVersions('8.0.0-alpha.1', '8.0.0-alpha.0')).toBe(1);
    expect(compareVersions('8.0.0-beta.0', '8.0.0-alpha.9')).toBe(1);
    // A larger set of fields outranks a smaller prefix.
    expect(compareVersions('8.0.0-alpha.1', '8.0.0-alpha')).toBe(1);
    // Numeric identifiers rank below alphanumeric ones.
    expect(compareVersions('8.0.0-1', '8.0.0-alpha')).toBe(-1);
  });

  it('ignores a leading v and build metadata', () => {
    expect(compareVersions('v8.0.1', '8.0.1')).toBe(0);
    expect(compareVersions('8.0.1+build.5', '8.0.1+build.9')).toBe(0);
  });

  it('treats unparseable versions as equal so no false update is claimed', () => {
    expect(compareVersions('not-a-version', '8.0.0')).toBe(0);
    expect(compareVersions('8.0', '8.0.0')).toBe(0);
    // parseInt is lenient ("0abc" -> 0); the regex guard must reject these.
    expect(compareVersions('8.0.0abc', '8.0.0')).toBe(0);
    expect(compareVersions('8..0', '8.0.0')).toBe(0);
    expect(compareVersions('8.0.0.1', '8.0.0')).toBe(0);
  });
});

describe('isNewer', () => {
  it('is true only when the remote strictly exceeds the current version', () => {
    expect(isNewer('8.0.1', '8.0.0')).toBe(true);
    expect(isNewer('8.0.0', '8.0.0-alpha.0')).toBe(true);
    expect(isNewer('8.0.0', '8.0.0')).toBe(false);
    expect(isNewer('8.0.0-alpha.0', '8.0.0')).toBe(false);
  });
});
