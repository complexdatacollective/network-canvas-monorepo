import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchLatestReleaseNotes,
  fetchReleaseNotesForVersion,
  readCachedNotes,
  selectLatestForApp,
  writeCachedNotes,
} from '../releaseNotes';

describe('selectLatestForApp', () => {
  it('returns the newest release whose tag matches the app prefix', () => {
    const releases = [
      { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
      { tag_name: '@codaco/architect@8.0.0-beta.4', body: 'newest arch' },
      { tag_name: '@codaco/architect@8.0.0-beta.3', body: 'older arch' },
    ];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '8.0.0-beta.4',
      body: 'newest arch',
    });
  });

  it('returns null when no tag matches the app', () => {
    const releases = [
      { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
    ];
    expect(selectLatestForApp('architect', releases)).toBeNull();
  });

  it('coerces a null body to an empty string', () => {
    const releases = [{ tag_name: '@codaco/architect@1.0.0', body: null }];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '1.0.0',
      body: '',
    });
  });

  // GitHub lists by creation date. An Architect 8 maintenance release created
  // after 9.x shipped comes first, and must never be offered to Architect 9.
  it('picks the highest version, not the most recently created release', () => {
    const releases = [
      { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
      { tag_name: '@codaco/architect@9.0.1', body: 'nine' },
      { tag_name: '@codaco/architect@9.0.0', body: 'nine zero' },
      { tag_name: '@codaco/architect@8.5.0', body: 'eight' },
    ];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '9.0.1',
      body: 'nine',
    });
    expect(selectLatestForApp('architect', releases, '9.0.0')).toEqual({
      version: '9.0.1',
      body: 'nine',
    });
  });

  it('ignores releases on a major below the running version', () => {
    const releases = [
      { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
      { tag_name: '@codaco/architect@8.5.0', body: 'eight' },
    ];
    expect(selectLatestForApp('architect', releases, '9.0.0')).toBeNull();
    expect(selectLatestForApp('architect', releases, '8.5.0')).toEqual({
      version: '8.5.1',
      body: 'maintenance',
    });
  });

  // A root Architect 8 install is replaced by Architect 9 at the same URL:
  // its update notes are the new major's, not the newest 8.x patch.
  it('still offers a newer major to the running version', () => {
    const releases = [
      { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
      { tag_name: '@codaco/architect@9.0.0', body: 'nine' },
    ];
    expect(selectLatestForApp('architect', releases, '8.5.0')).toEqual({
      version: '9.0.0',
      body: 'nine',
    });
  });

  // An archived line's host only ever serves that line, so the update waiting
  // there is the line's own newest release, never a newer major.
  it('keeps to the running major line when asked to', () => {
    const releases = [
      { tag_name: '@codaco/architect@9.0.0', body: 'nine' },
      { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
      { tag_name: '@codaco/architect@7.9.0', body: 'seven' },
    ];
    expect(
      selectLatestForApp('architect', releases, '8.5.0', {
        runningMajorOnly: true,
      }),
    ).toEqual({ version: '8.5.1', body: 'maintenance' });
  });

  it('orders prereleases by semver precedence', () => {
    const releases = [
      { tag_name: '@codaco/architect@9.0.0-beta.2', body: 'beta 2' },
      { tag_name: '@codaco/architect@9.0.0-beta.10', body: 'beta 10' },
      { tag_name: '@codaco/architect@9.0.0-alpha.11', body: 'alpha' },
    ];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '9.0.0-beta.10',
      body: 'beta 10',
    });
    expect(
      selectLatestForApp('architect', [
        ...releases,
        { tag_name: '@codaco/architect@9.0.0', body: 'stable' },
      ]),
    ).toEqual({ version: '9.0.0', body: 'stable' });
  });

  it('skips a matching tag that is not a version', () => {
    const releases = [
      { tag_name: '@codaco/architect@next', body: 'not a version' },
      { tag_name: '@codaco/architect@8.4.0', body: 'eight' },
    ];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '8.4.0',
      body: 'eight',
    });
  });
});

describe('notes cache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips notes through localStorage', () => {
    writeCachedNotes('interviewer', { version: '9.9.9', body: '# hi' });
    expect(readCachedNotes('interviewer')).toEqual({
      version: '9.9.9',
      body: '# hi',
    });
  });

  it('returns null when nothing is cached', () => {
    expect(readCachedNotes('architect')).toBeNull();
  });
});

describe('fetchLatestReleaseNotes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the newest matching release from the list endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
        { tag_name: '@codaco/architect@8.0.0-beta.4', body: 'arch notes' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLatestReleaseNotes('architect')).resolves.toEqual({
      version: '8.0.0-beta.4',
      body: 'arch notes',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/releases?per_page=',
    );
  });

  it('passes the running version through to the selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
        ],
      }),
    );

    await expect(
      fetchLatestReleaseNotes('architect', '9.0.0'),
    ).resolves.toBeNull();
    await expect(
      fetchLatestReleaseNotes('architect', '8.5.0'),
    ).resolves.toEqual({ version: '8.5.1', body: 'maintenance' });
  });

  const otherPackages = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      tag_name: `@codaco/fresco-ui@1.0.${index}`,
      body: '',
    }));

  it('reads one page when it holds a release on or above the running major', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        ...otherPackages(99),
        { tag_name: '@codaco/architect@9.1.0', body: 'nine one' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchLatestReleaseNotes('architect', '9.0.0'),
    ).resolves.toEqual({ version: '9.1.0', body: 'nine one' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('&page=1');
  });

  it('reads further full pages until one holds a release for the running major', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          ...otherPackages(99),
          // An older line is never this app's update, so it does not stop
          // the search.
          { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { tag_name: '@codaco/architect@9.0.0', body: 'nine' },
        ],
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchLatestReleaseNotes('architect', '9.0.0'),
    ).resolves.toEqual({ version: '9.0.0', body: 'nine' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('&page=2');
  });

  it('keeps reading past a newer major when kept to the running line', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          ...otherPackages(99),
          { tag_name: '@codaco/architect@9.0.0', body: 'nine' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { tag_name: '@codaco/architect@8.5.1', body: 'maintenance' },
        ],
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchLatestReleaseNotes('architect', '8.5.0', { runningMajorOnly: true }),
    ).resolves.toEqual({ version: '8.5.1', body: 'maintenance' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops after a few pages, and shows no notes when a later page fails', async () => {
    const full = otherPackages(100);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => full })
        .mockResolvedValueOnce({ ok: false, json: async () => [] }),
    );
    await expect(fetchLatestReleaseNotes('architect')).resolves.toBeNull();

    const always = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => full });
    vi.stubGlobal('fetch', always);
    await expect(fetchLatestReleaseNotes('architect')).resolves.toBeNull();
    expect(always).toHaveBeenCalledTimes(3);
  });

  it('resolves null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
    await expect(fetchLatestReleaseNotes('architect')).resolves.toBeNull();
  });

  it('resolves null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchLatestReleaseNotes('architect')).resolves.toBeNull();
  });
});

describe('fetchReleaseNotesForVersion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('URL-encodes the @-and-/ tag in the request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: '@codaco/architect@8.0.0-beta.4',
        body: 'notes',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchReleaseNotesForVersion('architect', '8.0.0-beta.4'),
    ).resolves.toEqual({ version: '8.0.0-beta.4', body: 'notes' });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('%40codaco%2Farchitect%408.0.0-beta.4');
    expect(url).not.toContain('@codaco/architect@');
  });

  it('resolves null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    await expect(
      fetchReleaseNotesForVersion('architect', '1.0.0'),
    ).resolves.toBeNull();
  });

  it('resolves null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(
      fetchReleaseNotesForVersion('architect', '1.0.0'),
    ).resolves.toBeNull();
  });
});
