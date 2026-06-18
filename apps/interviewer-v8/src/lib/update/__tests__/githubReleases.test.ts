import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchLatestRelease, parseVersionFromTag } from '../githubReleases';

// A plain implementation holder rather than a vi.fn: vitest tracks a mocked
// function's settled results, and a tracked fn returning a rejected promise
// surfaces a spurious unhandled rejection. Routing through a plain function
// avoids that while still letting each test choose the response.
type RequestImpl = () => Promise<{ status: number; data: unknown }>;
const state = vi.hoisted(() => ({
  impl: (() => Promise.resolve({ status: 200, data: [] })) as RequestImpl,
}));

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: () => state.impl() },
}));

function resolveWith(status: number, data: unknown) {
  state.impl = () => Promise.resolve({ status, data });
}

function release(overrides: Record<string, unknown>) {
  return {
    tag_name: 'interviewer-v8@v8.0.0',
    name: 'Release',
    body: 'notes',
    html_url: 'https://example.test/r',
    published_at: '2026-06-01T00:00:00Z',
    draft: false,
    ...overrides,
  };
}

describe('parseVersionFromTag', () => {
  it('extracts the version from a prefixed tag', () => {
    expect(parseVersionFromTag('interviewer-v8@v8.0.1')).toBe('8.0.1');
  });

  it('rejects tags for other products', () => {
    expect(parseVersionFromTag('v8.0.1')).toBeNull();
    expect(parseVersionFromTag('architect@v1.0.0')).toBeNull();
    expect(parseVersionFromTag('interviewer-v8@v')).toBeNull();
  });
});

describe('fetchLatestRelease', () => {
  beforeEach(() => resolveWith(200, []));

  it('returns the highest-version interviewer-v8 release', async () => {
    resolveWith(200, [
      release({ tag_name: 'interviewer-v8@v8.0.0' }),
      release({ tag_name: 'interviewer-v8@v8.2.0', name: 'Newest' }),
      release({ tag_name: 'interviewer-v8@v8.1.0' }),
    ]);

    const result = await fetchLatestRelease();
    expect(result?.version).toBe('8.2.0');
    expect(result?.releaseName).toBe('Newest');
  });

  it('ignores other products and draft releases', async () => {
    resolveWith(200, [
      release({ tag_name: 'architect@v9.9.9' }),
      release({ tag_name: 'interviewer-v8@v9.0.0', draft: true }),
      release({ tag_name: 'interviewer-v8@v8.0.5' }),
    ]);

    const result = await fetchLatestRelease();
    expect(result?.version).toBe('8.0.5');
  });

  it('returns null on a non-2xx response', async () => {
    resolveWith(403, {});
    expect(await fetchLatestRelease()).toBeNull();
  });

  it('returns null when the request rejects', async () => {
    state.impl = () => Promise.reject(new Error('offline'));
    expect(await fetchLatestRelease()).toBeNull();
  });

  it('returns null when no interviewer-v8 release exists', async () => {
    resolveWith(200, [release({ tag_name: 'architect@v1.0.0' })]);
    expect(await fetchLatestRelease()).toBeNull();
  });
});
