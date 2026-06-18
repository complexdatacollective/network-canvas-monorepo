import { App } from '@capacitor/app';

import { isCapacitor, isElectron } from '../platform/platform';
import { fetchLatestRelease } from './githubReleases';
import type { UpdateInfo } from './types';
import { isNewer } from './version';

// Returns details of an available newer release, or null when up to date / on a
// platform where checks don't apply (web). Best-effort: never throws — a failed
// check simply yields null so app launch is unaffected.
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    if (isElectron) return await checkElectron();
    if (isCapacitor) return await checkCapacitor();
    return null;
  } catch {
    return null;
  }
}

// Electron resolves availability + download via electron-updater in the main
// process (the renderer CSP blocks api.github.com); the main process also
// fetches the release notes markdown. See electron/update/updater.ts.
async function checkElectron(): Promise<UpdateInfo | null> {
  const api = window.electronAPI?.update;
  if (!api) return null;
  return api.check();
}

async function checkCapacitor(): Promise<UpdateInfo | null> {
  const [{ version: currentVersion }, release] = await Promise.all([
    App.getInfo(),
    fetchLatestRelease(),
  ]);

  if (!release || !isNewer(release.version, currentVersion)) return null;

  return {
    version: release.version,
    currentVersion,
    releaseName: release.releaseName,
    releaseNotesMarkdown: release.body,
    releaseUrl: release.htmlUrl,
    publishedAt: release.publishedAt,
  };
}
