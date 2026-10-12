// Offline tests binding the release test's bundled storage to production's.
//
// The release-test compose file cannot `extends` the production Garage: a
// service's top-level `configs:` do not travel across files. So it carries a
// copy of the Garage service, its init container and both inline configs, and
// a copy that drifted would certify a storage set-up no deployment runs. These
// tests fail on any drift in what the copy has to share, and bind the fixed
// test key the harness signs with to every place that names it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

const prod = parse(read('apps/fresco/docker-compose.prod.yml'));
const releaseTest = parse(read('apps/fresco/release-test/docker-compose.yml'));
const { LANES, STORAGE } =
  await import('../../apps/fresco/release-test/scripts/lanes.mjs');

test('the release-test Garage runs the production image and configuration', () => {
  const [prodGarage, testGarage] = [prod, releaseTest].map(
    (c) => c.services.garage,
  );
  assert.ok(testGarage, 'the release-test compose file has no garage service');
  assert.equal(testGarage.image, prodGarage.image);
  assert.deepEqual(testGarage.configs, prodGarage.configs);
  assert.deepEqual(testGarage.volumes, prodGarage.volumes);
});

test('the release-test garage-init is the production bootstrap', () => {
  const [prodInit, testInit] = [prod, releaseTest].map(
    (c) => c.services['garage-init'],
  );
  assert.ok(testInit, 'the release-test compose file has no garage-init');
  assert.equal(testInit.image, prodInit.image);
  assert.deepEqual(testInit.entrypoint, prodInit.entrypoint);
  assert.deepEqual(testInit.configs, prodInit.configs);
  assert.deepEqual(testInit.depends_on, prodInit.depends_on);
  assert.deepEqual(
    Object.keys(testInit.environment).toSorted(),
    Object.keys(prodInit.environment).toSorted(),
  );
});

test('both inline configs are byte-identical to production', () => {
  for (const name of ['garage-config', 'garage-init']) {
    const content = releaseTest.configs?.[name]?.content;
    assert.ok(content, `the release-test compose file has no ${name} config`);
    assert.equal(
      content,
      prod.configs[name].content,
      `the release-test ${name} has drifted from docker-compose.prod.yml`,
    );
  }
});

test('the app runs with the SDK checksum settings Garage needs', () => {
  for (const name of [
    'AWS_REQUEST_CHECKSUM_CALCULATION',
    'AWS_RESPONSE_CHECKSUM_VALIDATION',
  ]) {
    assert.equal(prod.services.fresco.environment[name], 'WHEN_REQUIRED');
    assert.equal(
      releaseTest.services.fresco.environment[name],
      prod.services.fresco.environment[name],
    );
  }
});

test('the app starts only once its storage is bootstrapped', () => {
  assert.deepEqual(releaseTest.services.fresco.depends_on['garage-init'], {
    condition: 'service_completed_successfully',
  });
});

// The browser loads the app from PUBLIC_URL and reaches storage on another
// port, so every presigned request is cross-origin: the bucket's CORS rule has
// to name exactly the origin the app is served from.
test('the bucket admits the origin the app is served from', () => {
  const env = releaseTest.services['garage-init'].environment;
  assert.equal(
    env.GARAGE_CORS_ORIGIN,
    releaseTest.services.fresco.environment.PUBLIC_URL,
  );
  assert.deepEqual(releaseTest.services.garage.ports, [
    '${STORAGE_PORT:-9310}:3900',
  ]);
});

test('up.sh hands garage-init the key the harness signs with', () => {
  const up = read('apps/fresco/release-test/up.sh');
  const value = (name) =>
    new RegExp(String.raw`\n${name}="([^"]*)"`).exec(up)?.[1];
  assert.equal(value('GARAGE_ACCESS_KEY_ID'), STORAGE.accessKeyId);
  assert.equal(value('GARAGE_SECRET_ACCESS_KEY'), STORAGE.secretAccessKey);
  // The formats garage-init itself enforces; a value outside them fails the
  // stack at start-up rather than here.
  assert.match(STORAGE.accessKeyId, /^GK[0-9a-f]{24}$/);
  assert.match(STORAGE.secretAccessKey, /^[0-9a-f]{64}$/);
  assert.match(value('GARAGE_RPC_SECRET') ?? '', /^[0-9a-f]{64}$/);
  assert.ok(value('GARAGE_ADMIN_TOKEN'), 'up.sh sets no GARAGE_ADMIN_TOKEN');
  for (const name of [
    'GARAGE_ACCESS_KEY_ID',
    'GARAGE_SECRET_ACCESS_KEY',
    'GARAGE_RPC_SECRET',
    'GARAGE_ADMIN_TOKEN',
  ])
    assert.match(
      /\nexport (?:[^\n\\]|\\\n)*/.exec(up)?.[0] ?? '',
      new RegExp(String.raw`\b${name}\b`),
      `up.sh does not export ${name} to compose`,
    );
  // The bootstrap's own constants, which the wizard has to repeat.
  const script = prod.configs['garage-init'].content;
  assert.match(script, new RegExp(`\\nBUCKET=${STORAGE.bucket}\\n`));
  assert.match(script, new RegExp(`\\nREGION=${STORAGE.region}\\n`));
});

// The agent-driven lanes are told the wizard's values in prose; the workflow
// script cannot import lanes.mjs, so its copies are bound here.
test('the workflow tells the setup agents the storage the stack serves', () => {
  const source = read('.claude/workflows/fresco-release-test.js');
  const steps = [
    ...source.matchAll(
      /Endpoint URL (\S+), Public URL http:\/\/localhost:(\d+), Bucket (\S+), Region (\S+), Access Key ID (\S+), Secret Access Key ([0-9a-f]+)\./g,
    ),
  ];
  assert.deepEqual(
    steps.map((m) => Number(m[2])).toSorted((a, b) => a - b),
    [LANES.upgrade.storagePort, LANES.fresh.storagePort].toSorted(
      (a, b) => a - b,
    ),
    'expected one storage step for each agent-driven lane',
  );
  for (const [, endpoint, , bucket, region, key, secret] of steps)
    assert.deepEqual(
      { endpoint, bucket, region, key, secret },
      {
        endpoint: STORAGE.endpoint,
        bucket: STORAGE.bucket,
        region: STORAGE.region,
        key: STORAGE.accessKeyId,
        secret: STORAGE.secretAccessKey,
      },
    );
});
