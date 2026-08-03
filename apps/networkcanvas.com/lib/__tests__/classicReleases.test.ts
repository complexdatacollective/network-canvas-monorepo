import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLatestClassicApps } from '../classicReleases';

const releaseResponse = (
  tagName: string,
  assets: readonly { name: string; browser_download_url: string }[],
) =>
  new Response(
    JSON.stringify({
      tag_name: tagName,
      assets,
    }),
  );

describe('latest Classic releases', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads both latest endpoints and derives their download links', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        releaseResponse('v7.0.0', [
          {
            name: 'Network.Canvas.Architect-7.0.0-mac-arm64.dmg',
            browser_download_url: 'https://example.com/architect-arm.dmg',
          },
          {
            name: 'Network.Canvas.Architect-7.0.0-mac-x64.dmg',
            browser_download_url: 'https://example.com/architect-intel.dmg',
          },
          {
            name: 'Network.Canvas.Architect-7.0.0-win-x64.exe',
            browser_download_url: 'https://example.com/architect.exe',
          },
        ]),
      )
      .mockResolvedValueOnce(
        releaseResponse('v8.0.0', [
          {
            name: 'Network.Canvas.Interviewer-8.0.0-arm64.dmg',
            browser_download_url: 'https://example.com/interviewer-arm.dmg',
          },
          {
            name: 'Network.Canvas.Interviewer-8.0.0.dmg',
            browser_download_url: 'https://example.com/interviewer-intel.dmg',
          },
          {
            name: 'Network.Canvas.Interviewer.Setup.8.0.0.exe',
            browser_download_url: 'https://example.com/interviewer.exe',
          },
        ]),
      );

    const apps = await getLatestClassicApps(fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/complexdatacollective/Architect/releases/latest',
      expect.objectContaining({ next: { revalidate: 3600 } }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/complexdatacollective/Interviewer/releases/latest',
      expect.objectContaining({ next: { revalidate: 3600 } }),
    );
    expect(apps.map(({ version }) => version)).toEqual(['7.0.0', '8.0.0']);
    expect(apps[0]?.platforms.map(({ href }) => href)).toEqual([
      'https://example.com/architect-arm.dmg',
      'https://example.com/architect-intel.dmg',
      'https://example.com/architect.exe',
      'https://github.com/complexdatacollective/Architect/releases/latest',
    ]);
    expect(apps[1]?.platforms.map(({ href }) => href)).toEqual([
      'https://example.com/interviewer-arm.dmg',
      'https://example.com/interviewer-intel.dmg',
      'https://example.com/interviewer.exe',
      'https://github.com/complexdatacollective/Interviewer/releases/latest',
      'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
    ]);
  });

  it('falls back per app when the latest endpoint is unavailable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        releaseResponse('v8.0.0', [
          {
            name: 'Network.Canvas.Interviewer-8.0.0-arm64.dmg',
            browser_download_url: 'https://example.com/interviewer-arm.dmg',
          },
          {
            name: 'Network.Canvas.Interviewer-8.0.0.dmg',
            browser_download_url: 'https://example.com/interviewer-intel.dmg',
          },
          {
            name: 'Network.Canvas.Interviewer.Setup.8.0.0.exe',
            browser_download_url: 'https://example.com/interviewer.exe',
          },
        ]),
      );

    const apps = await getLatestClassicApps(fetcher);

    expect(apps.map(({ version }) => version)).toEqual(['6.6.0', '8.0.0']);
    expect(apps[0]?.platforms.map(({ href }) => href)).toEqual([
      'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-mac-arm64.dmg',
      'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-mac-x64.dmg',
      'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-win-x64.exe',
      'https://github.com/complexdatacollective/Architect/releases/latest',
    ]);
    expect(apps[1]?.platforms.map(({ href }) => href)).toEqual([
      'https://example.com/interviewer-arm.dmg',
      'https://example.com/interviewer-intel.dmg',
      'https://example.com/interviewer.exe',
      'https://github.com/complexdatacollective/Interviewer/releases/latest',
      'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
    ]);
    expect(warning).toHaveBeenCalledWith(
      'Could not load the latest Architect Classic release (GitHub returned 429.) Falling back to v6.6.0.',
    );
  });
});
