import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  kernelChromiumWrapperSource,
  kernelQualificationEscalationCommand,
} from '../../apps/studio/client/scripts/telemetry-kernel-browser.mjs';

test('elevates the qualification process before Playwright creates browser pipes', () => {
  assert.deepEqual(
    kernelQualificationEscalationCommand({
      platform: 'linux',
      uid: 1001,
      home: '/home/runner',
      node: '/opt/node/bin/node',
      entrypoint: '/work/telemetry-egress.mjs',
      image: 'studio-candidate:abc123',
      observerImage: 'studio-observer:abc123',
      playwrightBrowsersPath: '/home/runner/.cache/ms-playwright',
    }),
    {
      file: 'sudo',
      args: [
        '--non-interactive',
        'env',
        'HOME=/home/runner',
        'STUDIO_TELEMETRY_KERNEL_IMAGE=studio-candidate:abc123',
        'STUDIO_TELEMETRY_KERNEL_OBSERVER_IMAGE=studio-observer:abc123',
        'PLAYWRIGHT_BROWSERS_PATH=/home/runner/.cache/ms-playwright',
        '/opt/node/bin/node',
        '/work/telemetry-egress.mjs',
      ],
    },
  );
  assert.equal(
    kernelQualificationEscalationCommand({
      platform: 'linux',
      uid: 0,
    }),
    null,
  );
});

test('launches Chromium inside the namespace without a descriptor-closing sudo hop', () => {
  const wrapper = kernelChromiumWrapperSource({
    namespacePid: '1234',
    browserUid: '1001',
    browserGid: '1001',
    executablePath: '/playwright/chrome',
  });
  assert.equal(
    wrapper,
    '#!/bin/sh\nexec nsenter --target 1234 --net -- setpriv --reuid=1001 --regid=1001 --clear-groups "/playwright/chrome" "$@"\n',
  );
  assert(!wrapper.includes('sudo'));
});
