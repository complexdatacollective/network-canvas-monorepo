import { describe, expect, it, vi } from 'vitest';

import classicDownload, {
  config,
  getClassicDownloadDestination,
} from '~/netlify/edge-functions/classic-download';

const architectAsset = {
  name: 'Network.Canvas.Architect-6.6.0-mac-arm64.dmg',
  browser_download_url:
    'https://github.com/complexdatacollective/Architect/releases/download/v6.6.0/Network.Canvas.Architect-6.6.0-mac-arm64.dmg',
};

describe('Classic download routing', () => {
  it('runs the resolver for every Classic download route', () => {
    expect(config.path).toBe('/downloads/classic/*');
  });

  it('resolves the current release asset when a download is requested', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ assets: [architectAsset] }));
    const request = new Request(
      'https://networkcanvas.com/downloads/classic/architect/6.6.0/apple-silicon',
    );

    await expect(getClassicDownloadDestination(request, fetcher)).resolves.toBe(
      architectAsset.browser_download_url,
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/complexdatacollective/Architect/releases/tags/v6.6.0',
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
  });

  it('falls back to the release page when GitHub cannot resolve an asset', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 429 }));

    await expect(
      getClassicDownloadDestination(
        new Request(
          'https://networkcanvas.com/downloads/classic/interviewer/6.6.0/windows',
        ),
        fetcher,
      ),
    ).resolves.toBe(
      'https://github.com/complexdatacollective/Interviewer/releases/tag/v6.6.0',
    );
  });

  it('rejects unknown download routes without querying GitHub', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const request = new Request(
      'https://networkcanvas.com/downloads/classic/architect/6.6.0/android',
    );

    await expect(
      getClassicDownloadDestination(request, fetcher),
    ).resolves.toBeUndefined();
    const response = await classicDownload(request);

    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
