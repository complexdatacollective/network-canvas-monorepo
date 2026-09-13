import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { chmod, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import { chromium } from '@playwright/test';

import {
  assertKernelTelemetryControls,
  assertKernelTelemetryEgressProtocols,
  assertKernelTelemetryReady,
  assertNoKernelTelemetryEgress,
  TELEMETRY_DETECTOR_SOURCE,
  TELEMETRY_KERNEL_OBSERVER_SOURCE,
} from '../../server/qualification/telemetry-egress.ts';

const execute = promisify(execFile);
const DEADLINE = 30_000;

function environmentAssignment(name, value) {
  assert(value && !value.includes('\0'), `${name} is required.`);
  return `${name}=${value}`;
}

/**
 * Enter privilege before Playwright opens Chromium's remote-debugging pipes.
 * sudo closes inherited descriptors by default, so placing it in the browser
 * executable wrapper loses Playwright's descriptors 3 and 4.
 */
export function kernelQualificationEscalationCommand({
  platform = process.platform,
  uid = process.getuid(),
  home = process.env.HOME,
  node = process.execPath,
  entrypoint = process.argv[1],
  image = process.env.STUDIO_TELEMETRY_KERNEL_IMAGE,
  observerImage = process.env.STUDIO_TELEMETRY_KERNEL_OBSERVER_IMAGE,
  playwrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH,
} = {}) {
  if (platform !== 'linux' || uid === 0) return null;
  assert(
    home && isAbsolute(home),
    'Kernel browser qualification requires an absolute HOME.',
  );
  assert(
    node && isAbsolute(node),
    'Kernel browser qualification requires an absolute Node executable.',
  );
  assert(
    entrypoint && isAbsolute(entrypoint),
    'Kernel browser qualification requires an absolute entrypoint.',
  );
  const environment = [
    environmentAssignment('HOME', home),
    environmentAssignment('STUDIO_TELEMETRY_KERNEL_IMAGE', image),
    environmentAssignment(
      'STUDIO_TELEMETRY_KERNEL_OBSERVER_IMAGE',
      observerImage,
    ),
  ];
  if (playwrightBrowsersPath)
    environment.push(
      environmentAssignment('PLAYWRIGHT_BROWSERS_PATH', playwrightBrowsersPath),
    );
  return {
    file: 'sudo',
    args: ['--non-interactive', 'env', ...environment, node, entrypoint],
  };
}

export async function runKernelQualificationCli(entrypoint, qualify) {
  const escalation = kernelQualificationEscalationCommand({ entrypoint });
  if (!escalation) return qualify();
  const child = spawn(escalation.file, escalation.args, { stdio: 'inherit' });
  const [code, signal] = await once(child, 'exit');
  assert.equal(
    signal,
    null,
    `Kernel browser qualification exited on ${signal}.`,
  );
  assert.equal(code, 0, `Kernel browser qualification exited with ${code}.`);
}

export function kernelChromiumWrapperSource({
  namespacePid,
  browserUid,
  browserGid,
  executablePath,
}) {
  assert.match(namespacePid, /^[1-9][0-9]*$/u);
  assert.match(browserUid, /^[0-9]+$/u);
  assert.match(browserGid, /^[0-9]+$/u);
  assert(executablePath && isAbsolute(executablePath));
  return `#!/bin/sh\nexec nsenter --target ${namespacePid} --net -- setpriv --reuid=${browserUid} --regid=${browserGid} --clear-groups ${JSON.stringify(executablePath)} "$@"\n`;
}

async function docker(args, { includeStderr = false, ...options } = {}) {
  const result = await execute('docker', args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: DEADLINE,
    ...options,
  });
  return (result.stdout + (includeStderr ? result.stderr : '')).trim();
}

async function assertObserverRunning(name) {
  assert.equal(
    await docker(['inspect', '--format', '{{.State.Running}}', name]),
    'true',
    'Browser kernel observer is no longer running.',
  );
}

async function waitForObserver(name) {
  let lastError;
  let logs = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    logs = await docker(['logs', name], { includeStderr: true });
    try {
      await assertObserverRunning(name);
      assertKernelTelemetryReady(logs);
      assertKernelTelemetryControls(logs);
      return logs;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(
    `Browser kernel observer did not become live. Recent qualification output: ${logs.slice(-4096)}`,
    { cause: lastError },
  );
}

export async function launchKernelObservedChromium({
  image,
  observerImage,
  serverPorts,
  scratch,
}) {
  assert.equal(
    process.platform,
    'linux',
    'Kernel browser qualification requires Linux.',
  );
  assert.equal(
    process.getuid(),
    0,
    'Kernel browser qualification must elevate before Playwright launches Chromium.',
  );
  assert.match(image, /^[a-zA-Z0-9][a-zA-Z0-9._/@:+-]{0,511}$/u);
  assert.match(observerImage, /^[a-zA-Z0-9][a-zA-Z0-9._/@:+-]{0,511}$/u);
  assert(serverPorts.length > 0 && serverPorts.every(Number.isInteger));
  const identity = randomBytes(6).toString('hex');
  const network = `studio-browser-kernel-${identity}`;
  const namespace = `${network}-namespace`;
  const detector = `${network}-detector`;
  const observer = `${network}-observer`;
  const servers = new Set();
  const cleanup = async () => {
    const failures = [];
    await docker([
      'rm',
      '--force',
      ...servers,
      observer,
      detector,
      namespace,
    ]).catch((error) => failures.push(error));
    await docker(['network', 'rm', network]).catch((error) =>
      failures.push(error),
    );
    if (failures.length)
      throw new AggregateError(
        failures,
        'Browser kernel qualification cleanup failed.',
      );
  };
  try {
    await docker(['network', 'create', '--internal', network]);
    await docker([
      'run',
      '-d',
      '--name',
      namespace,
      '--network',
      network,
      '--entrypoint',
      'node',
      image,
      '-e',
      'setInterval(() => {}, 60000)',
    ]);
    await docker([
      'run',
      '-d',
      '--name',
      detector,
      '--network',
      network,
      '--entrypoint',
      'node',
      image,
      '-e',
      TELEMETRY_DETECTOR_SOURCE,
    ]);
    const [detectorIp, namespacePid] = await Promise.all([
      docker([
        'inspect',
        '--format',
        `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,
        detector,
      ]),
      docker(['inspect', '--format', '{{.State.Pid}}', namespace]),
    ]);
    const endpoints = JSON.stringify({
      allowed: serverPorts.map((port) => ({
        protocol: 'tcp',
        host: '127.0.0.1',
        port,
      })),
      controls: [
        { protocol: 'tcp', host: detectorIp, port: 8443 },
        { protocol: 'udp', host: detectorIp, port: 8443 },
      ],
    });
    await docker([
      'run',
      '-d',
      '--name',
      observer,
      '--network',
      `container:${namespace}`,
      '--user',
      '0:0',
      '--read-only',
      '--tmpfs',
      '/tmp:size=1m,mode=1777',
      '--cap-drop',
      'ALL',
      '--cap-add',
      'NET_ADMIN',
      '--cap-add',
      'NET_RAW',
      '--env',
      `STUDIO_QUALIFICATION_KERNEL_ENDPOINTS=${endpoints}`,
      '--entrypoint',
      'node',
      observerImage,
      '-e',
      TELEMETRY_KERNEL_OBSERVER_SOURCE,
    ]);
    await waitForObserver(observer);
    const namespaceCommand =
      "process.stdout.write(require('node:fs').readlinkSync('/proc/self/ns/net'))";
    const [targetNamespace, observerNamespace] = await Promise.all([
      docker(['exec', namespace, 'node', '-e', namespaceCommand]),
      docker(['exec', observer, 'node', '-e', namespaceCommand]),
    ]);
    assert.equal(
      observerNamespace,
      targetNamespace,
      'Browser observer did not share the browser network namespace.',
    );
    const wrapper = join(scratch, 'kernel-chromium');
    const browserUid =
      process.env.STUDIO_TELEMETRY_BROWSER_UID ?? String(process.getuid());
    const browserGid =
      process.env.STUDIO_TELEMETRY_BROWSER_GID ?? String(process.getgid());
    await writeFile(
      wrapper,
      kernelChromiumWrapperSource({
        namespacePid,
        browserUid,
        browserGid,
        executablePath: chromium.executablePath(),
      }),
      { mode: 0o700 },
    );
    await chmod(wrapper, 0o700);
    // Capture only this disposable namespace's synthetic DNS traffic. Keep the
    // ordinary conntrack verdict authoritative; these bounded diagnostics do
    // not exempt a resolver or change any browser networking behavior.
    await docker([
      'exec',
      '--detach',
      observer,
      'sh',
      '-c',
      'timeout 30 tcpdump -i lo -nn -l -s 256 -c 32 port 53 > /tmp/browser-dns.log 2>&1',
    ]);
    for (let attempt = 0; attempt < 50; attempt++) {
      const diagnostic = await docker([
        'exec',
        observer,
        'cat',
        '/tmp/browser-dns.log',
      ]);
      if (diagnostic.includes('listening on lo')) break;
      if (attempt === 49)
        throw new Error(
          `Browser DNS diagnostic did not start: ${diagnostic.slice(-4096)}`,
        );
      await delay(100);
    }
    const assertBaseline = async (phase) => {
      const logs = await waitForObserver(observer);
      try {
        assertNoKernelTelemetryEgress(logs);
      } catch (error) {
        const diagnostic = await docker([
          'exec',
          observer,
          'cat',
          '/tmp/browser-dns.log',
        ]);
        throw new Error(
          `Kernel browser baseline emitted unexpected traffic ${phase}. DNS diagnostic: ${diagnostic.slice(-4096)}`,
          { cause: error },
        );
      }
    };
    const browser = await chromium.launch({
      executablePath: wrapper,
      headless: true,
    });
    await delay(500);
    await assertBaseline('after Chromium launch, before controls or Studio');
    const control = await browser.newPage();
    await control
      .goto(`http://${detectorIp}:8443/`, { waitUntil: 'commit' })
      .catch(() => {});
    await control.evaluate(
      async ({ address, port }) => {
        const connection = new RTCPeerConnection({
          iceServers: [{ urls: `stun:${address}:${port}` }],
        });
        try {
          connection.createDataChannel('kernel-control');
          await connection.setLocalDescription(await connection.createOffer());
          await new Promise((resolve) => setTimeout(resolve, 750));
        } finally {
          connection.close();
        }
      },
      { address: detectorIp, port: 8443 },
    );
    await control.close();
    await assertBaseline('after controls, before Studio');
    return {
      browser,
      origin: (port) => `http://127.0.0.1:${port}`,
      async readFile(path) {
        assert.match(path, /^\/app\//u);
        return docker(['exec', namespace, 'cat', path]);
      },
      async startServer({ port, mode, enabled }) {
        assert(serverPorts.includes(port));
        const name = `${network}-server-${port}`;
        servers.add(name);
        await docker([
          'run',
          '-d',
          '--name',
          name,
          '--network',
          `container:${namespace}`,
          '--entrypoint',
          'node',
          '--env',
          'NODE_ENV=production',
          '--env',
          'HOST=0.0.0.0',
          '--env',
          `PORT=${port}`,
          '--env',
          'CLIENT_DIST=/app/client',
          '--env',
          `STUDIO_DEPLOYMENT_MODE=${mode}`,
          '--env',
          `STUDIO_TELEMETRY=${enabled}`,
          image,
          'dist/index.js',
        ]);
        return {
          async waitForStarted() {
            for (let attempt = 0; attempt < 400; attempt++) {
              const output = await docker(['logs', name]);
              if (output.includes('STUDIO_SERVER_STARTED')) return output;
              const running = await docker([
                'inspect',
                '--format',
                '{{.State.Running}}',
                name,
              ]);
              if (running !== 'true')
                throw new Error(`Server startup failed: ${output}`);
              await delay(50);
            }
            throw new Error(
              `Server did not start in the isolated namespace: ${name}`,
            );
          },
          async output() {
            return docker(['logs', name]);
          },
          async stop() {
            await docker(['rm', '--force', name]);
            servers.delete(name);
          },
        };
      },
      async assertQuiet() {
        await assertObserverRunning(observer);
        const logs = await docker(['logs', observer]);
        assertKernelTelemetryReady(logs);
        assertNoKernelTelemetryEgress(logs);
      },
      async proveExternalLookalike() {
        await assertObserverRunning(observer);
        const page = await browser.newPage();
        await page
          .goto(`http://${detectorIp}:9443/`, { waitUntil: 'commit' })
          .catch(() => {});
        await page.evaluate(
          async ({ address, port }) => {
            const connection = new RTCPeerConnection({
              iceServers: [{ urls: `stun:${address}:${port}` }],
            });
            try {
              connection.createDataChannel('kernel-egress-control');
              await connection.setLocalDescription(
                await connection.createOffer(),
              );
              await new Promise((resolve) => setTimeout(resolve, 750));
            } finally {
              connection.close();
            }
          },
          { address: detectorIp, port: 9443 },
        );
        await page.close();
        for (let attempt = 0; attempt < 50; attempt++) {
          const logs = await docker(['logs', observer]);
          try {
            assertKernelTelemetryReady(logs);
            assertKernelTelemetryEgressProtocols(logs);
            return;
          } catch (error) {
            if (attempt === 49) throw error;
            await delay(100);
          }
        }
      },
      close: async () => {
        await browser.close();
        await cleanup();
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
