import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

async function docker(args, options = {}) {
  const result = await execute('docker', args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: DEADLINE,
    ...options,
  });
  return result.stdout.trim();
}

async function assertObserverRunning(name) {
  assert.equal(
    await docker(['inspect', '--format', '{{.State.Running}}', name]),
    'true',
    'Browser kernel observer is no longer running.',
  );
}

async function waitForObserver(name) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const logs = await docker(['logs', name]);
    try {
      await assertObserverRunning(name);
      assertKernelTelemetryReady(logs);
      assertKernelTelemetryControls(logs);
      return logs;
    } catch {
      await delay(100);
    }
  }
  throw new Error('Browser kernel observer did not become live.');
}

export async function launchKernelObservedChromium({
  image,
  serverPorts,
  scratch,
}) {
  assert.equal(
    process.platform,
    'linux',
    'Kernel browser qualification requires Linux.',
  );
  assert.match(image, /^[a-zA-Z0-9][a-zA-Z0-9._/@:+-]{0,511}$/u);
  assert(serverPorts.length > 0 && serverPorts.every(Number.isInteger));
  const identity = randomBytes(6).toString('hex');
  const network = `studio-browser-kernel-${identity}`;
  const namespace = `${network}-namespace`;
  const detector = `${network}-detector`;
  const observer = `${network}-observer`;
  const servers = new Set();
  const cleanup = async () => {
    await docker([
      'rm',
      '--force',
      ...servers,
      observer,
      detector,
      namespace,
    ]).catch(() => {});
    await docker(['network', 'rm', network]).catch(() => {});
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
      '--env',
      `STUDIO_QUALIFICATION_KERNEL_ENDPOINTS=${endpoints}`,
      '--entrypoint',
      'node',
      image,
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
    await writeFile(
      wrapper,
      `#!/bin/sh\nexec sudo nsenter --target ${namespacePid} --net -- setpriv --reuid=$(id -u) --regid=$(id -g) --clear-groups ${JSON.stringify(chromium.executablePath())} "$@"\n`,
      { mode: 0o700 },
    );
    await chmod(wrapper, 0o700);
    const browser = await chromium.launch({
      executablePath: wrapper,
      headless: true,
    });
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
    await waitForObserver(observer);
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
            await docker(['rm', '--force', name]).catch(() => {});
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
