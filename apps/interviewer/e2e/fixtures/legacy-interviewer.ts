import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { test as interviewerTest } from './test.js';

// A build of this app that bundles Interviewer 8, for the specs that follow a
// schema 8 interview out to it. See
// scripts/buildtime/preview-with-legacy-app.mjs for why it is a build of its
// own and what it sets.
//
// At /v8/ it serves a stub page that plays Interviewer 8's side of the embed
// contract (Interviewer 8's src/lib/interviewer9Embed.ts and
// interviewer9Navigation.ts), so the specs can assert on what Interviewer 9
// owes it:
//
// - loaded at the top level, it does what Interviewer 8 does: replaces itself
//   with Interviewer 9's /interview/<id> (search kept), which hosts it;
// - framed, it posts { type: 'interviewer8:ready' } to its parent at this
//   origin, records every reply (`window.__interviewer8Stub.replies`), and,
//   with the key the reply carries, decrypts its own session's row from the
//   shared database, as Interviewer 8 would read it: proof it is the real
//   key, not a copy of its shape;
// - framed, it pins the history with one entry of its own, as Interviewer 8's
//   interview back guard does (its useHistoryBackGuard), and re-pins it on a
//   Back, so the joint history holds an entry above Interviewer 9's that
//   Interviewer 9 must step over when the frame goes without closing;
// - its "Close interview" button pops that entry and then posts
//   { type: 'interviewer8:closed' }, as Interviewer 8's close does, and
//   "Finish and close" first marks its session finished in the shared
//   database, so a spec can see Interviewer 9 read it afresh.
//
// What the stub saw is shown on the page too, for a trace to read. Interviewer
// 8's own interview route is tested on its side. The stub is served by the
// app's real preview middleware, which serves `dist/v8/index.html` for every
// /v8/ path whenever it exists, so the stub stands where a bundled
// Interviewer 8 would.

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.resolve(
  APP_ROOT,
  '../../scripts/buildtime/preview-with-legacy-app.mjs',
);
// Above the default suite's 4180; one port and directory per concurrently
// running worker.
const FIRST_PORT = 4191;
// Vite builds in well under a minute here; the margin is for a loaded CI
// runner.
const BUILD_TIMEOUT_MS = 240_000;

/** Visible text of the page standing in for Interviewer 8 at /v8/. */
export const LEGACY_INTERVIEWER_STUB_HEADING = 'Interviewer 8 (e2e stub)';

/** The stub's button that ends its interview, as Interviewer 8's exit does. */
export const LEGACY_INTERVIEWER_STUB_CLOSE = 'Close interview';

/**
 * The stub's button that marks its session finished in the shared database,
 * as Interviewer 8's finish does, and then ends its interview.
 */
export const LEGACY_INTERVIEWER_STUB_FINISH = 'Finish and close';

/** What the stub recorded of one 'interviewer9:unlock' reply. */
export type StubUnlockReply = {
  enterAuthorized: unknown;
  key: {
    type: string;
    algorithm: string;
    extractable: boolean;
    usages: string[];
  } | null;
  /** The session row's network, decrypted with the key; null with no key. */
  decryptedNetwork: {
    nodes: { attributes?: Record<string, unknown> }[];
  } | null;
  /** Why decrypting failed, if it did. */
  error: string | null;
};

/** Everything the stub recorded, as `window.__interviewer8Stub` holds it. */
export type StubRecord = { readyPosted: boolean; replies: StubUnlockReply[] };

const STUB_SCRIPT = `
(() => {
  const record = { readyPosted: false, replies: [] };
  window.__interviewer8Stub = record;
  const status = document.getElementById('stub-status');
  const show = () => {
    status.textContent = JSON.stringify(record);
  };
  const match = /^\\/v8\\/interview\\/([^/?#]+)$/.exec(location.pathname);
  if (window.parent === window) {
    // Interviewer 8 at the top level sends the address on to Interviewer 9.
    location.replace(match ? '/interview/' + match[1] + location.search : '/');
    return;
  }
  const sessionId = match ? decodeURIComponent(match[1]) : null;
  const withSessions = (mode, use) =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('interviewer');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('sessions', mode);
        let result;
        use(transaction.objectStore('sessions'), (value) => {
          result = value;
        });
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  const readRow = () =>
    withSessions('readonly', (sessions, done) => {
      sessions.get(sessionId).onsuccess = (event) => done(event.target.result);
    });
  const finishRow = () =>
    withSessions('readwrite', (sessions) => {
      sessions.get(sessionId).onsuccess = (event) => {
        const row = event.target.result;
        const now = new Date().toISOString();
        sessions.put({ ...row, finishedAt: now, lastUpdatedAt: now });
      };
    });
  const fromBase64 = (b64) =>
    Uint8Array.from(atob(b64), (character) => character.charCodeAt(0));
  const decryptNetwork = async (key) => {
    const row = await readRow();
    if (!row || !row._enc) throw new Error('no encrypted row for ' + sessionId);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(row._enc.network.iv),
        additionalData: new TextEncoder().encode('sessions:' + sessionId),
      },
      key,
      fromBase64(row._enc.network.ct),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  };
  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== 'interviewer9:unlock') return;
    const key = data.key;
    const reply = {
      enterAuthorized: data.enterAuthorized,
      key:
        key instanceof CryptoKey
          ? {
              type: key.type,
              algorithm: key.algorithm.name,
              extractable: key.extractable,
              usages: [...key.usages].sort(),
            }
          : null,
      decryptedNetwork: null,
      error: null,
    };
    record.replies.push(reply);
    show();
    if (!(key instanceof CryptoKey)) return;
    try {
      reply.decryptedNetwork = await decryptNetwork(key);
    } catch (error) {
      reply.error = String(error);
    }
    show();
  });
  let pinned = true;
  history.pushState({ ncBackGuard: true }, '', location.href);
  window.addEventListener('popstate', () => {
    if (pinned) history.pushState({ ncBackGuard: true }, '', location.href);
  });
  const unpin = () =>
    new Promise((resolve) => {
      pinned = false;
      if (!history.state || history.state.ncBackGuard !== true) {
        resolve();
        return;
      }
      window.addEventListener('popstate', () => resolve(), { once: true });
      history.back();
    });
  const close = async () => {
    await unpin();
    window.parent.postMessage({ type: 'interviewer8:closed' }, location.origin);
  };
  document.getElementById('stub-close').addEventListener('click', close);
  document.getElementById('stub-finish').addEventListener('click', async () => {
    await finishRow();
    close();
  });
  window.parent.postMessage({ type: 'interviewer8:ready' }, location.origin);
  record.readyPosted = true;
  show();
})();
`;

const STUB_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${LEGACY_INTERVIEWER_STUB_HEADING}</title>
  </head>
  <body>
    <h1>${LEGACY_INTERVIEWER_STUB_HEADING}</h1>
    <button type="button" id="stub-close">${LEGACY_INTERVIEWER_STUB_CLOSE}</button>
    <button type="button" id="stub-finish">${LEGACY_INTERVIEWER_STUB_FINISH}</button>
    <pre id="stub-status"></pre>
    <script>${STUB_SCRIPT}</script>
  </body>
</html>
`;

type BundledLegacyInterviewer = { baseURL: string };

export const test = interviewerTest.extend<
  object,
  { bundledLegacyInterviewer: BundledLegacyInterviewer }
>({
  bundledLegacyInterviewer: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this destructuring; this one has none
    async ({}, use, workerInfo) => {
      const outDir = path.join(
        APP_ROOT,
        'node_modules/.cache/interviewer-e2e',
        `legacy-interviewer-${workerInfo.parallelIndex}`,
      );
      const port = FIRST_PORT + workerInfo.parallelIndex;
      const child = spawn(
        process.execPath,
        [
          SCRIPT,
          '--app',
          'interviewer',
          '--out-dir',
          outDir,
          '--port',
          String(port),
        ],
        {
          cwd: APP_ROOT,
          env: {
            ...process.env,
            // The same switch the suite's main build is made with (run.sh,
            // the CI job): no PostHog.
            VITE_DISABLE_ANALYTICS: 'true',
          },
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      );
      const exited = new Promise<never>((_resolve, reject) => {
        child.once('exit', (code, signal) =>
          reject(
            new Error(
              `the Interviewer 8 preview build exited (${signal ?? code}) before serving`,
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
            reject(new Error('the Interviewer 8 preview build did not finish')),
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
  baseURL: async ({ bundledLegacyInterviewer }, use) => {
    await use(bundledLegacyInterviewer.baseURL);
  },
});

export { expect } from '@playwright/test';
