import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { test } from 'vitest';

// These suites use node:test nested subtests and process-level failure oracles.
// Execute the real runner so failures propagate into the required script gate.
test('managed observability budget and anchor controls', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      'apps/studio/deployment/managed/observability-egress-budget.test.mjs',
      'apps/studio/deployment/managed/observability-monotonic-anchor.test.mjs',
      'apps/studio/deployment/managed/observability-dynamodb-anchor-store.test.mjs',
      'apps/studio/deployment/managed/observability-dynamodb-anchor-store.integration.test.mjs',
      'apps/studio/deployment/managed/observability-anchor-client.test.mjs',
      'scripts/studio/studio-managed-log-collector.test.mjs',
      'scripts/studio/studio-managed-log-collector-image.test.mjs',
    ],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /subscribes with Fly credentials and forwards only the sanitized composition/,
  );
  assert.match(
    result.stdout,
    /bundled runtime has a closed module graph and fails closed offline/,
  );
});
