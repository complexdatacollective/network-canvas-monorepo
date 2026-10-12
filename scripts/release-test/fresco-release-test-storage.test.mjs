// Offline tests binding the release test's bundled storage to production's.
//
// The release-test compose file cannot `extends` the production Garage: a
// service's top-level `configs:` do not travel across files. So it carries a
// copy of the Garage service and its inline config, and a copy that drifted
// would certify a storage set-up no deployment runs. These tests fail on any
// drift in what the copy has to share, and bind the fixed test key the
// harness signs with to every place that names it.
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
const { LANES, STORAGE, lane } =
  await import('../../apps/fresco/release-test/scripts/lanes.mjs');

// `${NAME:?message}` -> NAME; a literal stays as it is. The messages differ
// on purpose (production points at .env, the harness at up.sh).
const interpolated = (value) =>
  /^\$\{(\w+)(?::\?[^}]*)?\}$/.exec(String(value))?.[1] ?? value;

test('the release-test Garage runs the production image, command and configuration', () => {
  const [prodGarage, testGarage] = [prod, releaseTest].map(
    (c) => c.services.garage,
  );
  assert.ok(testGarage, 'the release-test compose file has no garage service');
  assert.equal(testGarage.image, prodGarage.image);
  assert.deepEqual(testGarage.command, prodGarage.command);
  assert.deepEqual(testGarage.configs, prodGarage.configs);
  assert.deepEqual(testGarage.volumes, prodGarage.volumes);
  const sources = (env) =>
    Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, interpolated(value)]),
    );
  assert.deepEqual(
    sources(testGarage.environment),
    sources(prodGarage.environment),
  );
});

test('the inline Garage configuration is byte-identical to production', () => {
  const content = releaseTest.configs?.['garage-config']?.content;
  assert.ok(content, 'the release-test compose file has no garage-config');
  assert.equal(
    content,
    prod.configs['garage-config'].content,
    'the release-test garage-config has drifted from docker-compose.prod.yml',
  );
  assert.deepEqual(Object.keys(releaseTest.configs), ['garage-config']);
});

test('the app waits for its storage as production does', () => {
  for (const compose of [prod, releaseTest])
    assert.deepEqual(compose.services.fresco.depends_on.garage, {
      condition: 'service_started',
    });
});

// The browser loads the app from PUBLIC_URL and reaches storage on another
// port, so every presigned request is cross-origin: the bucket's CORS rule has
// to name exactly the origin the app is served from. up.sh sets it through
// storage-urls.mjs, from the lane table's baseUrl.
test('the bucket admits the origin the app is served from', () => {
  const publicUrl = releaseTest.services.fresco.environment.PUBLIC_URL;
  for (const [name, { frescoPort }] of Object.entries(LANES))
    assert.equal(
      lane(name).baseUrl,
      publicUrl.replace('${FRESCO_PORT:-3210}', String(frescoPort)),
      `lane "${name}" would admit an origin its app is not served from`,
    );

  const storageUrls = read('apps/fresco/release-test/scripts/storage-urls.mjs');
  assert.match(storageUrls, /AllowedOrigins: \[baseUrl\]/);
  assert.match(
    storageUrls,
    /const \{ storagePort, baseUrl \} = lane\(values\.lane\);/,
  );

  const up = read('apps/fresco/release-test/up.sh');
  const startedAt = up.indexOf('\ncompose up -d --wait');
  const corsAt = up.search(
    /\nnode "\$SCRIPT_DIR\/scripts\/storage-urls\.mjs" cors --lane "\$LANE"/,
  );
  assert.ok(startedAt > -1, 'up.sh no longer starts the stack');
  assert.ok(
    corsAt > startedAt,
    'up.sh does not set the CORS rule once the stack is up',
  );

  assert.deepEqual(releaseTest.services.garage.ports, [
    '${STORAGE_PORT:-9310}:3900',
  ]);
});

test('up.sh hands Garage the key the harness signs with', () => {
  const up = read('apps/fresco/release-test/up.sh');
  const value = (name) =>
    new RegExp(String.raw`\n${name}="([^"]*)"`).exec(up)?.[1];
  assert.equal(value('GARAGE_ACCESS_KEY_ID'), STORAGE.accessKeyId);
  assert.equal(value('GARAGE_SECRET_ACCESS_KEY'), STORAGE.secretAccessKey);
  // The formats Garage itself enforces; a value outside them fails the stack
  // at start-up rather than here.
  assert.match(STORAGE.accessKeyId, /^GK[0-9a-f]{24}$/);
  assert.match(STORAGE.secretAccessKey, /^[0-9a-f]{64}$/);
  for (const name of ['GARAGE_ACCESS_KEY_ID', 'GARAGE_SECRET_ACCESS_KEY'])
    assert.match(
      /\nexport (?:[^\n\\]|\\\n)*/.exec(up)?.[0] ?? '',
      new RegExp(String.raw`\b${name}\b`),
      `up.sh does not export ${name} to compose`,
    );
  // The bucket and region the wizard has to repeat.
  const garage = prod.services.garage;
  assert.equal(garage.environment.GARAGE_DEFAULT_BUCKET, STORAGE.bucket);
  assert.match(
    prod.configs['garage-config'].content,
    new RegExp(`\\ns3_region = "${STORAGE.region}"\\n`),
  );
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
