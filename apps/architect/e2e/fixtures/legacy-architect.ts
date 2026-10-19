import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { test as architectTest } from './architect-test.js';

// A build of this app that offers Architect 8, for the specs that follow a
// protocol out to it. See scripts/buildtime/preview-with-legacy-app.mjs for why
// it is a build of its own and what it sets.
//
// At /v8/ it serves a stub page: the specs assert on the URL and on what was
// stored before the page went, and Architect 8's own handling of
// `/v8/?open=` and `/v8/?import=` is tested on its side. The stub is served by
// the app's real preview middleware, which serves `dist/v8` whenever it holds
// an index.html — so the stub stands where a bundled Architect 8 would.

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.resolve(
  APP_ROOT,
  '../../scripts/buildtime/preview-with-legacy-app.mjs',
);
// Above the default suite's 4301; one port and directory per concurrently
// running worker.
const FIRST_PORT = 4311;
// Vite builds in well under a minute here; the margin is for a loaded CI
// runner.
const BUILD_TIMEOUT_MS = 240_000;

/** Visible text of the page standing in for Architect 8 at /v8/. */
export const LEGACY_ARCHITECT_STUB_HEADING = 'Architect 8 (e2e stub)';

const STUB_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${LEGACY_ARCHITECT_STUB_HEADING}</title>
  </head>
  <body>
    <h1>${LEGACY_ARCHITECT_STUB_HEADING}</h1>
  </body>
</html>
`;

type BundledLegacyArchitect = { baseURL: string };

export const test = architectTest.extend<
  object,
  { bundledLegacyArchitect: BundledLegacyArchitect }
>({
  bundledLegacyArchitect: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this destructuring; this one has none
    async ({}, use, workerInfo) => {
      const outDir = path.join(
        APP_ROOT,
        'node_modules/.cache/architect-e2e',
        `legacy-architect-${workerInfo.parallelIndex}`,
      );
      const port = FIRST_PORT + workerInfo.parallelIndex;
      const child = spawn(
        process.execPath,
        [
          SCRIPT,
          '--app',
          'architect',
          '--out-dir',
          outDir,
          '--port',
          String(port),
        ],
        {
          cwd: APP_ROOT,
          env: {
            ...process.env,
            // The same switches the suite's main build is made with (run.sh,
            // the CI job): no PostHog, no animation bookkeeping.
            VITE_DISABLE_ANALYTICS: 'true',
            VITE_DISABLE_ANIMATIONS: 'true',
          },
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      );
      const exited = new Promise<never>((_resolve, reject) => {
        child.once('exit', (code, signal) =>
          reject(
            new Error(
              `the Architect 8 preview build exited (${signal ?? code}) before serving`,
            ),
          ),
        );
      });
      const ready = new Promise<string>((resolve) => {
        const lines = createInterface({ input: child.stdout });
        lines.on('line', (line) => {
          if (line.startsWith('ready ')) resolve(line.slice('ready '.length));
        });
      });
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error('the Architect 8 preview build did not finish')),
          BUILD_TIMEOUT_MS,
        );
      });
      try {
        const baseURL = await Promise.race([ready, exited, timedOut]);
        await mkdir(path.join(outDir, 'v8'), { recursive: true });
        await writeFile(path.join(outDir, 'v8', 'index.html'), STUB_HTML);
        await use({ baseURL: new URL(baseURL).origin });
      } finally {
        clearTimeout(timer);
        exited.catch(() => {});
        if (child.exitCode === null) {
          const stopped = new Promise((resolve) => child.once('exit', resolve));
          child.kill('SIGTERM');
          await stopped;
        }
      }
    },
    { scope: 'worker', timeout: BUILD_TIMEOUT_MS + 30_000 },
  ],
  // Every page in a spec using this fixture talks to that build.
  baseURL: async ({ bundledLegacyArchitect }, use) => {
    await use(bundledLegacyArchitect.baseURL);
  },
});

export { expect } from '@playwright/test';
