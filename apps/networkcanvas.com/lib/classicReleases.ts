import { z } from 'zod';

import {
  createClassicApps,
  type ClassicApp,
  type ClassicRelease,
} from '~/lib/getStarted';

type ClassicRepository = 'Architect' | 'Interviewer';

function createFallbackRelease(
  repository: ClassicRepository,
  version: string,
  assetNames: readonly string[],
): ClassicRelease {
  const releaseRoot = `https://github.com/complexdatacollective/${repository}/releases`;

  return {
    version,
    latestUrl: `${releaseRoot}/latest`,
    assets: assetNames.map((name) => ({
      name,
      browserDownloadUrl: `${releaseRoot}/download/v${version}/${name}`,
    })),
  };
}

const fallbackClassicReleases = {
  Architect: createFallbackRelease('Architect', '6.6.0', [
    'Network.Canvas.Architect-6.6.0-mac-arm64.dmg',
    'Network.Canvas.Architect-6.6.0-mac-x64.dmg',
    'Network.Canvas.Architect-6.6.0-win-x64.exe',
  ]),
  Interviewer: createFallbackRelease('Interviewer', '6.6.0', [
    'Network.Canvas.Interviewer-6.6.0-arm64.dmg',
    'Network.Canvas.Interviewer-6.6.0.dmg',
    'Network.Canvas.Interviewer.Setup.6.6.0.exe',
  ]),
} satisfies Record<ClassicRepository, ClassicRelease>;

const githubReleaseSchema = z.object({
  tag_name: z.string().regex(/^v\d+\.\d+\.\d+(?:-.+)?$/),
  assets: z.array(
    z.object({
      name: z.string().min(1),
      browser_download_url: z.url(),
    }),
  ),
});

async function getLatestRelease(
  repository: ClassicRepository,
  fetcher: typeof fetch,
): Promise<ClassicRelease> {
  try {
    const response = await fetcher(
      `https://api.github.com/repos/complexdatacollective/${repository}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        next: { revalidate: 3600 },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}.`);
    }

    const release = githubReleaseSchema.parse(await response.json());

    return {
      version: release.tag_name.slice(1),
      latestUrl: `https://github.com/complexdatacollective/${repository}/releases/latest`,
      assets: release.assets.map((asset) => ({
        name: asset.name,
        browserDownloadUrl: asset.browser_download_url,
      })),
    };
  } catch (error) {
    const fallback = fallbackClassicReleases[repository];
    const reason = error instanceof Error ? error.message : String(error);

    console.warn(
      `Could not load the latest ${repository} Classic release (${reason}) Falling back to v${fallback.version}.`,
    );

    return fallback;
  }
}

export async function getLatestClassicApps(
  fetcher: typeof fetch = fetch,
): Promise<readonly ClassicApp[]> {
  const [architect, interviewer] = await Promise.all([
    getLatestRelease('Architect', fetcher),
    getLatestRelease('Interviewer', fetcher),
  ]);

  try {
    return createClassicApps({ architect, interviewer });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    console.warn(
      `Could not derive Classic downloads from the latest release metadata (${reason}) Falling back to the last-known releases.`,
    );

    return createClassicApps({
      architect: fallbackClassicReleases.Architect,
      interviewer: fallbackClassicReleases.Interviewer,
    });
  }
}
