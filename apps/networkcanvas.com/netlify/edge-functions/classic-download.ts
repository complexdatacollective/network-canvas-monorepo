import type { Config } from '@netlify/edge-functions';

import {
  CLASSIC_DOWNLOAD_PATH_PREFIX,
  getClassicDownloadAssetUrl,
  getClassicDownloadDefinition,
  getClassicReleaseTagUrl,
  type ClassicDownloadAsset,
  type ClassicDownloadDefinition,
} from '../../lib/classicDownloads.ts';

function parseAssets(value: unknown): readonly ClassicDownloadAsset[] {
  if (typeof value !== 'object' || value === null || !('assets' in value)) {
    throw new Error('GitHub release response has no assets.');
  }

  const { assets } = value;
  if (!Array.isArray(assets)) {
    throw new Error('GitHub release assets are not an array.');
  }

  return assets.map((asset) => {
    if (
      typeof asset !== 'object' ||
      asset === null ||
      !('name' in asset) ||
      typeof asset.name !== 'string' ||
      !('browser_download_url' in asset) ||
      typeof asset.browser_download_url !== 'string'
    ) {
      throw new Error('GitHub returned an invalid release asset.');
    }

    return {
      name: asset.name,
      browserDownloadUrl: asset.browser_download_url,
    };
  });
}

function isTrustedAssetUrl(
  value: string,
  definition: ClassicDownloadDefinition,
) {
  const url = new URL(value);
  const expectedPathPrefix =
    `/complexdatacollective/${definition.repository}/releases/download/`.toLowerCase();

  return (
    url.origin === 'https://github.com' &&
    url.pathname.toLowerCase().startsWith(expectedPathPrefix)
  );
}

function getDownloadDefinition(request: Request) {
  const path = new URL(request.url).pathname
    .slice(CLASSIC_DOWNLOAD_PATH_PREFIX.length)
    .replace(/^\/+|\/+$/g, '');
  const [app, version, platform, ...extraSegments] = path.split('/');
  if (
    !app ||
    !version ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
    !platform ||
    extraSegments.length > 0
  ) {
    return undefined;
  }

  const definition = getClassicDownloadDefinition(app, platform);
  if (!definition) return undefined;

  return { definition, version };
}

export async function getClassicDownloadDestination(
  request: Request,
  fetcher: typeof fetch = fetch,
) {
  const download = getDownloadDefinition(request);
  if (!download) return undefined;

  const { definition, version } = download;
  const releaseUrl = getClassicReleaseTagUrl(definition.repository, version);

  try {
    const response = await fetcher(
      `https://api.github.com/repos/complexdatacollective/${definition.repository}/releases/tags/v${version}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) return releaseUrl;

    const assets = parseAssets(await response.json());
    const assetUrl = getClassicDownloadAssetUrl(definition, assets);

    return isTrustedAssetUrl(assetUrl, definition) ? assetUrl : releaseUrl;
  } catch {
    return releaseUrl;
  }
}

export default async function classicDownload(request: Request) {
  const destination = await getClassicDownloadDestination(request);
  if (!destination) return new Response('Not found', { status: 404 });

  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Location': destination,
    },
  });
}

export const config: Config = {
  path: `${CLASSIC_DOWNLOAD_PATH_PREFIX}/*`,
};
