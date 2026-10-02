import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  compareVersions,
  fetchGitHubNotesForVersion,
  fetchLatestGitHubNotes,
  fetchLatestReleaseNotes,
  fetchReleaseNotesForVersion,
  readCachedNotes,
  selectFeedNotes,
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

describe('fetchLatestGitHubNotes', () => {
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

    await expect(fetchLatestGitHubNotes('architect')).resolves.toEqual({
      version: '8.0.0-beta.4',
      body: 'arch notes',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/releases?per_page=',
    );
  });

  it('resolves null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
    await expect(fetchLatestGitHubNotes('architect')).resolves.toBeNull();
  });

  it('resolves null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchLatestGitHubNotes('architect')).resolves.toBeNull();
  });
});

describe('fetchGitHubNotesForVersion', () => {
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
      fetchGitHubNotesForVersion('architect', '8.0.0-beta.4'),
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
      fetchGitHubNotesForVersion('architect', '1.0.0'),
    ).resolves.toBeNull();
  });

  it('resolves null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(
      fetchGitHubNotesForVersion('architect', '1.0.0'),
    ).resolves.toBeNull();
  });
});

const feedUpdates = [
  {
    versions: { architect: '8.3.1' },
    title: 'Architect 8.3.1',
    summary: '- Fixed protocol import.',
  },
  {
    versions: { architect: '8.3.0', interviewer: '8.3.0' },
    title: 'Language localization',
    summary: 'More than one language.',
    details: 'All the details.',
  },
  {
    versions: { architect: '8.2.5' },
    title: 'Architect 8.2.5',
    summary: '- An older fix.',
  },
];

function feedResponse(updates: unknown[] = feedUpdates) {
  return { ok: true, json: async () => ({ schemaVersion: 1, updates }) };
}

function githubLatest(version: string, body = 'github notes') {
  return {
    ok: true,
    json: async () => [{ tag_name: `@codaco/architect@${version}`, body }],
  };
}

function routedFetch(feed: unknown, github: unknown) {
  return vi.fn((url: string) =>
    Promise.resolve(
      new URL(url).hostname === 'networkcanvas.com' ? feed : github,
    ),
  );
}

describe('compareVersions', () => {
  it('orders by number, then puts a prerelease before its release', () => {
    expect(compareVersions('8.10.0', '8.9.0')).toBe(1);
    expect(compareVersions('8.3.0', '8.3.0')).toBe(0);
    expect(compareVersions('8.0.0-beta.2', '8.0.0-beta.10')).toBeLessThan(0);
    expect(compareVersions('8.0.0-beta.13', '8.0.0')).toBe(-1);
  });
});

describe('selectFeedNotes', () => {
  it('collects every entry after one version, newest first', () => {
    expect(
      selectFeedNotes('architect', feedUpdates, {
        after: '8.2.5',
        upTo: '8.3.1',
      }),
    ).toEqual({
      version: '8.3.1',
      body: [
        '### Architect 8.3.1',
        '- Fixed protocol import.',
        '### Language localization',
        'More than one language.',
        'All the details.',
      ].join('\n\n'),
    });
  });

  it('takes only the named version when nothing earlier is given', () => {
    expect(
      selectFeedNotes('interviewer', feedUpdates, { upTo: '8.3.0' }),
    ).toEqual({
      version: '8.3.0',
      body: '### Language localization\n\nMore than one language.\n\nAll the details.',
    });
  });

  it('returns null when no entry covers the app in range', () => {
    expect(
      selectFeedNotes('fresco', feedUpdates, { after: '4.0.0' }),
    ).toBeNull();
  });
});

describe('fetchLatestReleaseNotes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers the feed when it knows the newest release', async () => {
    vi.stubGlobal('fetch', routedFetch(feedResponse(), githubLatest('8.3.1')));

    await expect(
      fetchLatestReleaseNotes('architect', '8.3.0'),
    ).resolves.toMatchObject({
      version: '8.3.1',
      body: '### Architect 8.3.1\n\n- Fixed protocol import.',
    });
  });

  it('puts a newer GitHub release above the entries the feed has', async () => {
    vi.stubGlobal('fetch', routedFetch(feedResponse(), githubLatest('8.3.2')));

    await expect(
      fetchLatestReleaseNotes('architect', '8.3.0'),
    ).resolves.toEqual({
      version: '8.3.2',
      body: '### 8.3.2\n\ngithub notes\n\n### Architect 8.3.1\n\n- Fixed protocol import.',
    });
  });

  it('uses GitHub alone when the feed has nothing newer', async () => {
    vi.stubGlobal('fetch', routedFetch(feedResponse(), githubLatest('8.3.2')));

    await expect(
      fetchLatestReleaseNotes('architect', '8.3.1'),
    ).resolves.toEqual({ version: '8.3.2', body: 'github notes' });
  });

  it('falls back to GitHub when the feed is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({ ok: false, json: async () => ({}) }, githubLatest('8.3.1')),
    );

    await expect(
      fetchLatestReleaseNotes('architect', '8.3.0'),
    ).resolves.toEqual({ version: '8.3.1', body: 'github notes' });
  });

  it('ignores a feed in a schema it does not know', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(
        { ok: true, json: async () => ({ schemaVersion: 2, updates: [] }) },
        githubLatest('8.3.1'),
      ),
    );

    await expect(
      fetchLatestReleaseNotes('architect', '8.3.0'),
    ).resolves.toEqual({ version: '8.3.1', body: 'github notes' });
  });
});

describe('fetchReleaseNotesForVersion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists every feed entry since the version last opened', async () => {
    const fetchMock = routedFetch(feedResponse(), githubLatest('8.3.1'));
    vi.stubGlobal('fetch', fetchMock);

    const notes = await fetchReleaseNotesForVersion(
      'architect',
      '8.3.1',
      '8.2.5',
    );

    expect(notes?.version).toBe('8.3.1');
    expect(notes?.body).toContain('### Architect 8.3.1');
    expect(notes?.body).toContain('### Language localization');
    expect(notes?.body).not.toContain('8.2.5');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the GitHub release when the feed lacks the version', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(feedResponse(), {
        ok: true,
        json: async () => ({
          tag_name: '@codaco/architect@8.3.2',
          body: 'github 8.3.2',
        }),
      }),
    );

    await expect(
      fetchReleaseNotesForVersion('architect', '8.3.2', '8.3.1'),
    ).resolves.toEqual({ version: '8.3.2', body: 'github 8.3.2' });
  });

  it('keeps the feed entries since the last version alongside a newer GitHub release', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(feedResponse(), {
        ok: true,
        json: async () => ({
          tag_name: '@codaco/architect@8.3.2',
          body: 'github 8.3.2',
        }),
      }),
    );

    await expect(
      fetchReleaseNotesForVersion('architect', '8.3.2', '8.3.0'),
    ).resolves.toEqual({
      version: '8.3.2',
      body: '### 8.3.2\n\ngithub 8.3.2\n\n### Architect 8.3.1\n\n- Fixed protocol import.',
    });
  });
});
