import { app, type BrowserWindow, net } from 'electron';
import electronUpdater from 'electron-updater';

import {
  isUpdateSimulated,
  simulateDownload,
  simulateInstall,
  simulatedUpdate,
} from './devSimulation';
import type { UpdateInfo } from './types';

const { autoUpdater } = electronUpdater;

const REPO = 'complexdatacollective/network-canvas-monorepo';
const RELEASE_TAG_PREFIX = 'interviewer-v8@v';

let getWindow: () => BrowserWindow | null = () => null;

// Attaches the long-lived download/error listeners once and disables automatic
// behaviour — download and install are user-initiated from the update dialog.
export function initAutoUpdater(window: () => BrowserWindow | null): void {
  getWindow = window;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    send('update:downloaded', null);
  });

  autoUpdater.on('error', (error) => {
    send(
      'update:error',
      error instanceof Error ? error.message : String(error),
    );
  });
}

function send(channel: string, payload: unknown): void {
  getWindow()?.webContents.send(channel, payload);
}

// Resolves the latest release's availability via electron-updater (it performs
// the semver comparison against app.getVersion() internally and emits exactly
// one of update-available / update-not-available / error), then fetches the
// human-readable release notes from the GitHub API by tag. Returns null when up
// to date, in dev (no app-update.yml), or on any failure — the launch check is
// best-effort and must never block startup.
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // Dev (electron:dev): return a simulated update so the desktop flow can be
  // tested without a packaged build / real feed. See devSimulation.ts.
  if (isUpdateSimulated()) return simulatedUpdate();

  const offHandlers: Array<() => void> = [];
  const cleanup = () => {
    for (const off of offHandlers) off();
    offHandlers.length = 0;
  };

  const availability = new Promise<string | null>((resolve) => {
    const onAvailable = (info: { version: string }) => {
      cleanup();
      resolve(info.version);
    };
    const onNotAvailable = () => {
      cleanup();
      resolve(null);
    };
    const onError = () => {
      cleanup();
      resolve(null);
    };
    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);
    offHandlers.push(
      () => autoUpdater.off('update-available', onAvailable),
      () => autoUpdater.off('update-not-available', onNotAvailable),
      () => autoUpdater.off('error', onError),
    );
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // checkForUpdates() may reject without emitting an event — remove the
    // one-shot listeners so they don't accumulate across repeated calls.
    cleanup();
    return null;
  }

  const version = await availability;
  if (!version) return null;

  const notes = await fetchReleaseNotes(version);
  return {
    version,
    currentVersion: app.getVersion(),
    releaseName: notes?.name ?? `Version ${version}`,
    releaseNotesMarkdown: notes?.body ?? '',
    releaseUrl: notes?.htmlUrl ?? releasePageUrl(version),
    publishedAt: notes?.publishedAt ?? null,
  };
}

export async function downloadUpdate(): Promise<void> {
  if (isUpdateSimulated()) {
    simulateDownload(
      (progress) => send('update:progress', progress),
      () => send('update:downloaded', null),
    );
    return;
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    send(
      'update:error',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function quitAndInstall(): void {
  if (isUpdateSimulated()) {
    void simulateInstall();
    return;
  }
  autoUpdater.quitAndInstall();
}

function releasePageUrl(version: string): string {
  return `https://github.com/${REPO}/releases/tag/${RELEASE_TAG_PREFIX}${version}`;
}

type ReleaseNotes = {
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string | null;
};

// Main-process fetch (renderer CSP is connect-src 'self'). Uses Electron's net
// module so it shares the app's network stack/proxy config.
async function fetchReleaseNotes(
  version: string,
): Promise<ReleaseNotes | null> {
  const url = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG_PREFIX}${version}`;
  try {
    const response = await net.fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null) return null;

    const name =
      'name' in data && typeof data.name === 'string' && data.name
        ? data.name
        : `Version ${version}`;
    const body =
      'body' in data && typeof data.body === 'string' ? data.body : '';
    const htmlUrl =
      'html_url' in data && typeof data.html_url === 'string'
        ? data.html_url
        : releasePageUrl(version);
    const publishedAt =
      'published_at' in data && typeof data.published_at === 'string'
        ? data.published_at
        : null;

    return { name, body, htmlUrl, publishedAt };
  } catch {
    return null;
  }
}
