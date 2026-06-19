import { APP_VERSION } from '../platform/appVersion';
import type { UpdateInfo } from './types';

// The web target exists for development only (see CLAUDE.md). To exercise the
// full update UX — toast, release-notes dialog, skip/dismiss — without a real
// GitHub release, `vite dev` returns a canned "update available" here. Guarded
// by `import.meta.env.DEV`, so a production web build (DEV === false) returns
// null and never simulates. Electron/Capacitor never reach this path.
export function simulatedWebUpdate(): UpdateInfo | null {
  if (!import.meta.env.DEV) return null;

  return {
    version: '8.1.0',
    currentVersion: APP_VERSION,
    releaseName: 'Network Canvas Interviewer 8.1.0 (simulated)',
    releaseNotesMarkdown: SIMULATED_NOTES,
    releaseUrl:
      'https://github.com/complexdatacollective/network-canvas-monorepo/releases',
    publishedAt: '2026-06-18T00:00:00.000Z',
  };
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
