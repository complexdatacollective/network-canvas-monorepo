import { app, dialog } from 'electron';

import type { UpdateInfo, UpdateProgress } from './types';

// Electron auto-update can only run from a packaged build (it needs the
// app-update.yml baked in at package time + a real feed). To exercise the
// desktop flow — toast, dialog, background download with progress, restart &
// install — in `electron:dev`, the updater simulates an available update when
// the app is not packaged. A packaged build always uses real electron-updater.
export function isUpdateSimulated(): boolean {
  return !app.isPackaged;
}

export function simulatedUpdate(): UpdateInfo {
  return {
    version: '8.1.0',
    currentVersion: app.getVersion(),
    releaseName: 'Network Canvas Interviewer 8.1.0 (simulated)',
    releaseNotesMarkdown: SIMULATED_NOTES,
    releaseUrl:
      'https://github.com/complexdatacollective/network-canvas-monorepo/releases',
    publishedAt: '2026-06-18T00:00:00.000Z',
  };
}

// Emits download-progress events that ramp to 100%, then a downloaded event —
// the same channels the real autoUpdater forwards — so the dialog's progress
// bar and "Restart & install" transition can be tested. Returns a disposer.
export function simulateDownload(
  emitProgress: (progress: UpdateProgress) => void,
  emitDownloaded: () => void,
): () => void {
  const total = 64 * 1024 * 1024;
  const bytesPerSecond = 6 * 1024 * 1024;
  let percent = 0;

  const timer = setInterval(() => {
    percent = Math.min(100, percent + 8);
    emitProgress({
      percent,
      transferred: Math.round((total * percent) / 100),
      total,
      bytesPerSecond,
    });
    if (percent >= 100) {
      clearInterval(timer);
      setTimeout(emitDownloaded, 300);
    }
  }, 350);

  return () => clearInterval(timer);
}

export async function simulateInstall(): Promise<void> {
  await dialog.showMessageBox({
    type: 'info',
    title: 'Simulated update',
    message: 'Simulated install',
    detail:
      'In a packaged build the app would now quit, install the update, and relaunch. Nothing is installed in development.',
    buttons: ['OK'],
  });
}

const SIMULATED_NOTES = [
  '## What’s new in 8.1.0',
  '',
  'This release note is **simulated** for local development.',
  '',
  '- **Resumable interviews** that survive an app restart',
  '- Faster import for large `.netcanvas` protocols',
  '- A clearer first-run setup flow',
  '',
  '### Fixes',
  '',
  '- Fixed an edge case in the name generator',
  '- Improved error messages on export',
  '',
  '[View the full changelog](https://github.com/complexdatacollective/network-canvas-monorepo/releases)',
].join('\n');
