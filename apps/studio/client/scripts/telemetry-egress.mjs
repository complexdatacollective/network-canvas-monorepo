// Actual built app + actual browser SDK. Every external browser request is
// intercepted, and the server runs inside the browser's observed network
// namespace, so this diagnostic can never upload test events. Build both
// Studio deployables with the local PostHog upload stub first: the gate
// deliberately refuses artifacts without processed chunk IDs.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';

import {
  launchKernelObservedChromium,
  runKernelQualificationCli,
} from './telemetry-kernel-browser.mjs';

const CANARY = 'BrowserPerson@example.test-PrivateProtocol-SecretBrowserToken';
const relay = 'ph-relay.networkcanvas.com';
const statusVersion = '99.98.97';

/**
 * Install the one response skew this qualification needs inside Chromium.
 * The native fetch must run first: only the browser is in the isolated network
 * namespace that owns the Studio server's loopback address. The successful
 * oRPC envelope is then copied byte-for-byte apart from `json.version`, so the
 * real client proves that telemetry identifies its own build when a separately
 * deployed server reports a different version.
 */
export function installStatusVersionSkew({ origin, version }) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const inputUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(inputUrl, origin);
    const response = await nativeFetch(input, init);
    if (url.origin !== origin || url.pathname !== '/rpc/status')
      return response;
    if (!response.ok) return response;

    const body = await response.clone().json();
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      body.json === null ||
      typeof body.json !== 'object' ||
      Array.isArray(body.json) ||
      typeof body.json.version !== 'string'
    ) {
      throw new Error('Studio status response envelope changed');
    }
    const skewedBody = {
      ...body,
      json: { ...body.json, version },
    };
    // Qualification-only evidence that the app's real request traversed this
    // exact branch. It is read after the app has consumed the response.
    globalThis.__studioStatusVersionSkew = skewedBody;
    const encoded = JSON.stringify(skewedBody);
    const headers = new Headers(response.headers);
    if (headers.has('content-length'))
      headers.set(
        'content-length',
        String(new TextEncoder().encode(encoded).length),
      );
    return new Response(encoded, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise((done) => server.close(done));
  return address.port;
}

export async function runTelemetryBrowserQualification({
  image,
  observerImage,
  clientDist,
  clientVersion,
} = {}) {
  const root = resolve(import.meta.dirname, '..');
  const results = [];
  const resolvedClientDist = clientDist ?? join(root, 'dist');
  const resolvedImage = image ?? process.env.STUDIO_TELEMETRY_KERNEL_IMAGE;
  const resolvedObserverImage =
    observerImage ?? process.env.STUDIO_TELEMETRY_KERNEL_OBSERVER_IMAGE;
  assert(
    resolvedImage,
    'Kernel browser qualification requires the built Studio image.',
  );
  assert(
    resolvedObserverImage,
    'Kernel browser qualification requires the observer image.',
  );
  const resolvedClientVersion =
    clientVersion ??
    (clientDist
      ? JSON.parse(await readFile(join(clientDist, '../package.json'), 'utf8'))
          .version
      : JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version);
  const scratch = await mkdtemp(join(tmpdir(), 'studio-browser-telemetry-'));
  const serverPorts = await Promise.all(
    Array.from({ length: 4 }, () => port()),
  );
  const kernel = await launchKernelObservedChromium({
    image: resolvedImage,
    observerImage: resolvedObserverImage,
    serverPorts,
    scratch,
  });
  const browser = kernel.browser;
  let serverPortIndex = 0;
  try {
    const html = (
      clientDist
        ? await readFile(join(resolvedClientDist, 'index.html'), 'utf8')
        : await kernel.readFile('/app/client/index.html')
    ).replaceAll('&#39;', "'");
    assert.notEqual(resolvedClientVersion, statusVersion);
    assert(html.includes('Content-Security-Policy'));
    assert(html.includes('no-referrer'));
    assert(html.includes(`connect-src 'self' data: blob: https://${relay}`));
    assert(html.includes("script-src 'self'"));
    for (const mode of ['managed', 'self-hosted']) {
      for (const enabled of [false, true]) {
        const serverPort = serverPorts[serverPortIndex++];
        const origin = kernel.origin(serverPort);
        const server = await kernel.startServer({
          port: serverPort,
          mode,
          enabled,
        });
        const output = await server.waitForStarted();
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
          // The internal browser network has no route to the Internet. In the
          // off cases, continue the request so the kernel observer sees any
          // attempted TCP, UDP or DNS path instead of hiding it in Playwright.
          if (!enabled) return route.continue();
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
        await context.addInitScript(installStatusVersionSkew, {
          origin,
          version: statusVersion,
        });
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
        try {
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
          assert.equal(
            runtimeStatus.json.version,
            resolvedClientVersion,
            'The browser must receive the real server response before the in-context skew',
          );
          const skewedStatus = await page.evaluate(
            () => globalThis.__studioStatusVersionSkew,
          );
          assert.deepEqual(
            skewedStatus,
            {
              ...runtimeStatus,
              json: { ...runtimeStatus.json, version: statusVersion },
            },
            'The browser-context skew must preserve the real oRPC envelope and change only the server version',
          );
          await page.locator('main').first().waitFor({ state: 'visible' });
          if (enabled)
            await page.waitForFunction(() =>
              performance
                .getEntriesByType('resource')
                .some((entry) =>
                  entry.name.includes('module.slim.no-external'),
                ),
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
                script.addEventListener('load', () => done(false), {
                  once: true,
                });
                document.head.append(script);
              });
            } finally {
              clearTimeout(timer);
              window.removeEventListener(
                'securitypolicyviolation',
                onViolation,
              );
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
            const posts = requests.filter(
              (request) => request.method === 'POST',
            );
            assert.equal(
              posts.length,
              2,
              'Both manual error hooks must report',
            );
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
              assert.deepEqual(Object.keys(envelope).toSorted(), [
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
                resolvedClientVersion,
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
          results.push({
            mode,
            telemetry: enabled,
            sdkChunks: sdkChunks.length,
            relayRequests: requests.length,
            privateCanaryAbsent: true,
            sanitizedFrames: enabled ? 2 : 0,
            remoteScriptBlocked,
          });
        } finally {
          await context.close();
          await server.stop();
        }
      }
    }
    await kernel.assertQuiet();
    await kernel.proveExternalLookalike();
    process.stdout.write(
      `${JSON.stringify({
        passed: true,
        kernelNetworkObserved: true,
        browserTransports: ['tcp', 'udp'],
        cases: results,
      })}\n`,
    );
  } finally {
    await kernel.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runKernelQualificationCli(resolve(process.argv[1]), () =>
    runTelemetryBrowserQualification(),
  );
