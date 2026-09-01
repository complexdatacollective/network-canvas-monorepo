import { z } from 'zod';

import {
  createClassicApps,
  type ClassicApp,
  type ClassicRelease,
} from '~/lib/getStarted';

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
  repository: 'Architect' | 'Interviewer',
  fetcher: typeof fetch,
): Promise<ClassicRelease> {
  const response = await fetcher(
    `https://api.github.com/repos/complexdatacollective/${repository}/releases/latest`,
    {
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not load the latest ${repository} Classic release from GitHub (${response.status}).`,
    );
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
}

/**
 * Resolve installer URLs while Next statically generates the Get Started page.
 * Failures intentionally propagate so a build cannot ship stale or partial links.
 */
export async function getLatestClassicApps(
  fetcher: typeof fetch = fetch,
): Promise<readonly ClassicApp[]> {
  const [architect, interviewer] = await Promise.all([
    getLatestRelease('Architect', fetcher),
    getLatestRelease('Interviewer', fetcher),
  ]);

  return createClassicApps({ architect, interviewer });
}
