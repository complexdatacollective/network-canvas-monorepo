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
