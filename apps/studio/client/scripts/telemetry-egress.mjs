// Actual built app + actual browser SDK. Every external browser request is
// intercepted, and the Node preload refuses server egress, so this diagnostic
// can never upload test events. Build both Studio deployables with the local
// PostHog upload stub first (the quality-support job shows the environment):
// the gate deliberately refuses artifacts without processed chunk IDs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from '@playwright/test';

import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';

const root = resolve(import.meta.dirname, '..');
const serverRoot = resolve(root, '../server');
const CANARY = 'BrowserPerson@example.test-PrivateProtocol-SecretBrowserToken';
const relay = 'ph-relay.networkcanvas.com';
const results = [];
const statusVersion = '99.98.97';
const { version: clientVersion } = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
);
assert.notEqual(clientVersion, statusVersion);

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise((done) => server.close(done));
  return address.port;
}

const html = (await readFile(join(root, 'dist/index.html'), 'utf8')).replaceAll(
  '&#39;',
  "'",
);
assert(html.includes('Content-Security-Policy'));
assert(html.includes('no-referrer'));
assert(html.includes(`connect-src 'self' data: blob: https://${relay}`));
assert(html.includes("script-src 'self'"));
const scratch = await mkdtemp(join(tmpdir(), 'studio-browser-telemetry-'));
const preload = join(scratch, 'refuse-egress.mjs');
await writeFile(
  preload,
  `globalThis.fetch = async () => { process.send({ type: 'unexpected-server-egress' }); throw new Error('Test refuses server egress'); };`,
);
const browser = await chromium.launch({ headless: true });
try {
  for (const mode of ['managed', 'self-hosted']) {
    for (const enabled of [false, true]) {
      const serverPort = await port();
      const origin = `http://127.0.0.1:${serverPort}`;
      const child = spawn(
        process.execPath,
        ['--import', preload, join(serverRoot, 'dist/index.js')],
        {
          cwd: serverRoot,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: 'production',
            HOST: '127.0.0.1',
            PORT: String(serverPort),
            CLIENT_DIST: join(root, 'dist'),
            STUDIO_DEPLOYMENT_MODE: mode,
            STUDIO_TELEMETRY: String(enabled),
          },
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
      );
      const serverEgress = [];
      child.on('message', (message) => serverEgress.push(message));
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      const exited = once(child, 'exit');
      // PostHog deliberately filters HeadlessChrome as a bot. Exercise the
      // real visitor path with Chromium's ordinary desktop user agent.
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      });
      const requests = [];
      const sdkChunks = [];
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) {
          if (url.pathname === '/rpc/status') {
            const response = await route.fetch();
            const body = await response.json();
            // Independent release lanes can deploy different client/server
            // versions. Keep all real status fields except this deliberate skew.
            body.json.version = statusVersion;
            return route.fulfill({ response, json: body });
          }
          if (url.pathname.includes('module.slim.no-external'))
            sdkChunks.push(url.pathname);
          return route.continue();
        }
        requests.push({
          url: request.url(),
          method: request.method(),
          headers: await request.allHeaders(),
          body: request.postData(),
        });
        await route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Content-Type': 'application/json',
          },
          body: '{"status":1}',
        });
      });
      // The SDK also checks client-hint brands and webdriver. These fixture
      // overrides select its ordinary-browser path; production keeps its bot filter.
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'webdriver', {
          get: () => false,
        });
        Object.defineProperty(Navigator.prototype, 'userAgentData', {
          get: () => undefined,
        });
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const consoleMessages = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning')
          consoleMessages.push(message.text());
      });
      let completed = false;
      try {
        for (
          let attempt = 0;
          attempt < 400 && !output.includes('STUDIO_SERVER_STARTED');
          attempt++
        ) {
          if (child.exitCode !== null || child.signalCode !== null)
            throw new Error(`Server startup failed: ${output}`);
          await delay(50);
        }
        assert(output.includes('STUDIO_SERVER_STARTED'), output);
        const status = page.waitForResponse((response) =>
          response.url().includes('/rpc/status'),
        );
        await page.goto(`${origin}/?${CANARY}`);
        const statusResponse = await status;
        assert.equal(statusResponse.status(), 200);
        const runtimeStatus = await statusResponse.json();
        assert.equal(runtimeStatus.json.telemetry, enabled);
        assert.equal(runtimeStatus.json.deployment.mode, mode);
        assert.equal(runtimeStatus.json.version, statusVersion);
        await page.locator('main').first().waitFor({ state: 'visible' });
        if (enabled)
          await page.waitForFunction(() =>
            performance
              .getEntriesByType('resource')
              .some((entry) => entry.name.includes('module.slim.no-external')),
          );
        // There is no event for "no unexpected SDK channel". Let loaded config,
        // flags, timers and a lazy import settle; the enabled exception below
        // proves this exact route interceptor can observe a real SDK request.
        await page.waitForTimeout(500);
        assert.deepEqual(
          requests,
          [],
          'SDK startup unexpectedly contacted the relay',
        );
        assert.deepEqual(
          pageErrors,
          [],
          'The built app did not render cleanly',
        );
        const remoteScriptBlocked = await page.evaluate(async (relayHost) => {
          const script = document.createElement('script');
          script.src = `https://${relayHost}/static/studio-csp-probe.js`;
          let timer;
          let onViolation;
          try {
            return await new Promise((done, reject) => {
              timer = setTimeout(
                () => reject(new Error('CSP probe did not settle')),
                2_000,
              );
              onViolation = (event) => {
                if (
                  event.blockedURI === script.src &&
                  event.effectiveDirective === 'script-src-elem'
                )
                  done(true);
              };
              window.addEventListener('securitypolicyviolation', onViolation);
              script.onload = () => done(false);
              document.head.append(script);
            });
          } finally {
            clearTimeout(timer);
            window.removeEventListener('securitypolicyviolation', onViolation);
            script.remove();
          }
        }, relay);
        assert.equal(
          remoteScriptBlocked,
          true,
          'CSP allowed a remote SDK extension',
        );
        assert.deepEqual(requests, [], 'CSP probe reached the network');
        const reported = enabled
          ? page
              .waitForResponse(
                (response) =>
                  new URL(response.url()).hostname === relay &&
                  response.request().method() === 'POST',
                { timeout: 5_000 },
              )
              .then(
                () => null,
                (error) => error,
              )
          : undefined;
        const frameEvidence = await page.evaluate((canary) => {
          // This registry comes from processing the real built app; never
          // inject a test-owned registry that could conceal missing processing.
          const chunks = globalThis._posthogChunkIds;
          if (!chunks || typeof chunks !== 'object') return null;
          const registered = Object.entries(chunks)
            .map(([stack, id]) => ({
              id,
              location: /^\s*at (?:.*? \()?([^()\s]+):(\d+):(\d+)\)?$/m.exec(
                stack,
              ),
            }))
            .find(({ location }) => location?.[1]?.includes('/assets/'));
          if (!registered?.location) return null;
          const [, filename, line, column] = registered.location;
          const stack = [
            `Error: ${canary}`,
            `    at ${canary} (${filename}:${line}:${column})`,
            // A query-bearing lookalike is not the registered compiled file.
            `    at ${canary} (${filename}?${canary}:5:6)`,
          ].join('\n');
          const privateError = () =>
            Object.assign(new Error(canary, { cause: new Error(canary) }), {
              stack,
              participantId: canary,
              protocol: { name: canary },
            });
          window.dispatchEvent(
            new ErrorEvent('error', {
              error: privateError(),
            }),
          );
          window.dispatchEvent(
            new PromiseRejectionEvent('unhandledrejection', {
              promise: Promise.resolve(),
              reason: privateError(),
            }),
          );
          return {
            id: registered.id,
            line: Number(line),
            column: Number(column),
            filename,
          };
        }, CANARY);
        assert(
          frameEvidence,
          'Processed app must register a compiled chunk before the privacy probe',
        );
        const reportingError = await reported;
        if (reportingError) {
          process.stderr.write(
            JSON.stringify({
              mode,
              enabled,
              sdkChunks,
              requestCount: requests.length,
              consoleMessages,
            }) + '\n',
          );
          throw reportingError;
        }
        // Negative observation window after both error hooks were stimulated.
        await page.waitForTimeout(500);
        if (!enabled) {
          assert.deepEqual(sdkChunks, [], 'Off loaded the PostHog SDK chunk');
          assert.deepEqual(requests, [], 'Off attempted telemetry egress');
        } else {
          assert.equal(
            sdkChunks.length,
            1,
            'The positive control did not load the actual SDK',
          );
          const posts = requests.filter((request) => request.method === 'POST');
          assert.equal(posts.length, 2, 'Both manual error hooks must report');
          for (const request of requests) {
            assert.equal(new URL(request.url).hostname, relay);
            assert.equal(
              request.headers.referer,
              undefined,
              'Browser URL leaked through Referer',
            );
            assert(
              !request.url.includes('/flags') &&
                !request.url.includes('/static/'),
            );
          }
          const payload = JSON.stringify(posts);
          assert(payload.includes('client_error'));
          assert(payload.includes('client_unhandled_rejection'));
          assert(
            !payload.includes(CANARY),
            'Private browser values reached the wire',
          );
          for (const post of posts) {
            const envelope = JSON.parse(post.body);
            assert.deepEqual(Object.keys(envelope).sort(), [
              'api_key',
              'batch',
              'sent_at',
            ]);
            const batch = envelope.batch;
            assert(
              Array.isArray(batch),
              'The SDK must send its JSON event batch',
            );
            assert.equal(
              batch.length,
              1,
              'Each request must contain only its explicit exception',
            );
            const event = batch[0];
            assert.equal(
              event.properties?.[POSTHOG_APP_PROPS.APP_VERSION],
              clientVersion,
              'Client SDK wire must identify the client build despite server version skew',
            );
            const exceptions = event.properties?.$exception_list;
            assert.equal(
              exceptions?.length,
              1,
              'The actual SDK wire must contain one exception',
            );
            assert.deepEqual(
              exceptions[0].stacktrace?.frames,
              [
                {
                  platform: 'web:javascript',
                  filename: 'studio.js',
                  function: 'compiled',
                  chunk_id: frameEvidence.id,
                  lineno: frameEvidence.line,
                  colno: frameEvidence.column,
                },
              ],
              'A nonempty, sanitized registered frame must reach the actual SDK wire',
            );
          }
          assert(
            !payload.includes(frameEvidence.filename),
            'Raw compiled filename reached the wire',
          );
          assert(
            !payload.includes('$current_url') &&
              !payload.includes('$session_id') &&
              !payload.includes('$device_id'),
          );
        }
        assert.deepEqual(serverEgress, []);
        results.push({
          mode,
          telemetry: enabled,
          sdkChunks: sdkChunks.length,
          relayRequests: requests.length,
          privateCanaryAbsent: true,
          sanitizedFrames: enabled ? 2 : 0,
          remoteScriptBlocked,
        });
        completed = true;
      } finally {
        await context.close();
        child.kill('SIGTERM');
        const [code, signal] = await exited;
        // Cleanup must not replace the assertion that failed in the fixture.
        if (completed) {
          assert.equal(signal, null, output);
          assert.equal(code, 0, output);
        }
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ passed: true, cases: results })}\n`);
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
