import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTHENTICATED_FLY_NATS_TRANSPORT,
  createAuthenticatedFlyLogAdapter,
  FLY_LOG_MAX_BATCH_INPUT_BYTES,
  FLY_LOG_MAX_ENVELOPE_BYTES,
  FLY_LOG_MAX_SUBJECT_CHARACTERS,
  MANAGED_FLY_LOG_ENVELOPE_CONTRACT,
} from './studio-managed-fly-log-envelope.mjs';
import { MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY } from './studio-managed-log-sanitizer.mjs';

const encoder = new TextEncoder();
const requestId = '123e4567-e89b-42d3-a456-426614174000';
const instance = '18574832b905e8';
const applications = {
  'studio-production': 'nc-studio-production',
  'studio-staging': 'nc-studio-staging',
  'registry-production': 'nc-registry-production',
  'registry-staging': 'nc-registry-staging',
};
const adapter = createAuthenticatedFlyLogAdapter({
  region: 'iad',
  applications,
});

const innerStudio = (changes = {}) => ({
  level: 30,
  time: '2026-09-08T12:34:56.789Z',
  event: 'http_request',
  request_id: requestId,
  route: '/healthz',
  method: 'GET',
  status: 200,
  duration_ms: 1.25,
  ...changes,
});

const innerRegistry = (changes = {}) => ({
  timestamp: '2026-09-08T12:34:56.789Z',
  event: 'http_request',
  request_id: requestId,
  route: '/healthz',
  method: 'GET',
  status: 200,
  duration_ms: 1.25,
  ...changes,
});

const provenance = (service = 'studio-production', changes = {}) => ({
  transport: AUTHENTICATED_FLY_NATS_TRANSPORT,
  subject: `logs.${applications[service]}.iad.${instance}`,
  ...changes,
});

const flyEvent = (
  service = 'studio-production',
  message = innerStudio(),
  changes = {},
) => ({
  event: { provider: 'app' },
  fly: {
    app: { instance, name: applications[service] },
    region: 'iad',
  },
  host: instance,
  log: { level: 'info' },
  message: JSON.stringify(message),
  timestamp: '2026-09-08T12:34:57.123456789Z',
  ...changes,
});

const bytes = (value) =>
  encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));

test('publishes the exact portable envelope contract', () => {
  assert.deepEqual(MANAGED_FLY_LOG_ENVELOPE_CONTRACT.services, [
    'studio-production',
    'studio-staging',
    'registry-production',
    'registry-staging',
  ]);
  assert.equal(MANAGED_FLY_LOG_ENVELOPE_CONTRACT.region, 'iad');
  assert.equal(
    MANAGED_FLY_LOG_ENVELOPE_CONTRACT.transport,
    AUTHENTICATED_FLY_NATS_TRANSPORT,
  );
  assert.deepEqual(MANAGED_FLY_LOG_ENVELOPE_CONTRACT.limits, {
    envelopeBytes: FLY_LOG_MAX_ENVELOPE_BYTES,
    subjectCharacters: FLY_LOG_MAX_SUBJECT_CHARACTERS,
    batchRecords: 256,
    batchInputBytes: FLY_LOG_MAX_BATCH_INPUT_BYTES,
  });
});

test('binds all four logical services only through authenticated exact subjects', () => {
  for (const service of Object.keys(applications)) {
    const isStudio = service.startsWith('studio-');
    const output = adapter.sanitizeRecord(
      bytes(flyEvent(service, isStudio ? innerStudio() : innerRegistry())),
      provenance(service),
    );
    assert.deepEqual(output, {
      schema_id: MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
      service,
      environment: service.endsWith('-production') ? 'production' : 'staging',
      timestamp: Date.parse('2026-09-08T12:34:56.789Z'),
      event: 'http_request',
      request_id: requestId,
      route: '/healthz',
      method: 'GET',
      status: 200,
      duration_ms: 1.25,
    });
  }
});

test('rejects invalid configuration before accepting input', () => {
  for (const configuration of [
    { region: 'ord', applications },
    {
      region: 'iad',
      applications: { ...applications, 'studio-production': 'bad.name' },
    },
    {
      region: 'iad',
      applications: {
        ...applications,
        'studio-production': applications['studio-staging'],
      },
    },
    {
      region: 'iad',
      applications: { ...applications, extra: 'extra-app' },
    },
  ]) {
    assert.throws(
      () => createAuthenticatedFlyLogAdapter(configuration),
      /invalid managed Fly|exact and distinct/,
    );
  }
});

test('rejects missing, claimed, malformed, wildcard, and mismatched provenance', () => {
  const input = bytes(flyEvent());
  for (const source of [
    undefined,
    { subject: provenance().subject },
    { ...provenance(), transport: 'message-claimed-fly-nats' },
    {
      ...provenance(),
      subject: `logs.${applications['studio-production']}.ord.${instance}`,
    },
    {
      ...provenance(),
      subject: `logs.${applications['studio-staging']}.iad.${instance}`,
    },
    {
      ...provenance(),
      subject: `logs.${applications['studio-production']}.iad.*`,
    },
    {
      ...provenance(),
      subject: `logs.${applications['studio-production']}.iad.${instance}.extra`,
    },
    { ...provenance(), untrusted: true },
  ]) {
    assert.equal(adapter.sanitizeRecord(input, source), undefined);
  }
});

test('rejects an overlong subject before splitting and poisons its batch', (context) => {
  const input = bytes(flyEvent());
  const oversized = {
    ...provenance(),
    subject: 'x'.repeat(FLY_LOG_MAX_SUBJECT_CHARACTERS + 1),
  };
  const split = context.mock.method(String.prototype, 'split');
  assert.equal(adapter.sanitizeRecord(input, oversized), undefined);
  assert.equal(split.mock.callCount(), 0);
  split.mock.restore();
  assert.deepEqual(
    adapter.sanitizeBatch([
      { payload: input, provenance: oversized },
      { payload: input, provenance: provenance() },
    ]),
    [],
  );
});

test('rejects spoofed or unknown envelope fields instead of deriving identity from them', () => {
  for (const event of [
    flyEvent('studio-staging'),
    flyEvent('studio-production', innerStudio(), {
      fly: {
        app: {
          instance: 'aaaaaaaaaaaaaa',
          name: applications['studio-production'],
        },
        region: 'iad',
      },
    }),
    flyEvent('studio-production', innerStudio(), { environment: 'production' }),
    flyEvent(
      'studio-production',
      innerStudio({ service: 'participant@example.test-secret-token' }),
    ),
    flyEvent('studio-production', innerStudio(), {
      event: { provider: 'system' },
    }),
  ]) {
    const output = adapter.sanitizeRecord(bytes(event), provenance());
    assert.equal(output, undefined);
  }
});

test('accepts stdout and stderr envelopes but uses the application timestamp and schema', () => {
  const stdout = adapter.sanitizeRecord(bytes(flyEvent()), provenance());
  const stderr = adapter.sanitizeRecord(
    bytes(
      flyEvent(
        'registry-production',
        {
          timestamp: '2026-09-08T12:34:56.789Z',
          code: 'REGISTRY_RECOVERY_FAILED',
          request_id: requestId,
        },
        { log: { level: 'error' }, level: 'error' },
      ),
    ),
    provenance('registry-production'),
  );
  assert.equal(stdout?.timestamp, Date.parse('2026-09-08T12:34:56.789Z'));
  assert.equal(stderr?.diagnostic, 'REGISTRY_RECOVERY_FAILED');
  assert.equal(stderr?.request_id, requestId);
  assert.equal('host' in stderr, false);
  assert.equal('level' in stderr, false);
});

test('rejects duplicate members, unknown members, and invalid envelope metadata', () => {
  const valid = JSON.stringify(flyEvent());
  const duplicateMessage = `${valid.slice(0, -1)},"message":"{}"}`;
  const duplicateNestedRegion = valid.replace(
    '"region":"iad"',
    '"region":"iad","region":"iad"',
  );
  const duplicateUnicodeMessage = valid.replace(
    '"message":',
    '"m\\u0065ssage":"{}","message":',
  );
  const fixtures = [
    duplicateMessage,
    duplicateNestedRegion,
    duplicateUnicodeMessage,
    flyEvent('studio-production', innerStudio(), { unknown: 'private' }),
    flyEvent('studio-production', innerStudio(), {
      timestamp: '2026-02-30T00:00:00Z',
    }),
    flyEvent('studio-production', innerStudio(), { log: { level: 'notice' } }),
    flyEvent('studio-production', innerStudio(), { level: 'error' }),
    flyEvent('studio-production', innerStudio(), {
      host: 'host contains spaces',
    }),
  ];
  for (const fixture of fixtures)
    assert.equal(
      adapter.sanitizeRecord(bytes(fixture), provenance()),
      undefined,
    );
});

test('bounds malformed UTF-8 and outer and inner bytes before forwarding', () => {
  const oversizedOuter = new Uint8Array(FLY_LOG_MAX_ENVELOPE_BYTES + 1).fill(
    32,
  );
  const oversizedInner = flyEvent('studio-production', 'x'.repeat(4_097));
  for (const input of [
    new Uint8Array(),
    Uint8Array.from([0xc3, 0x28]),
    bytes('{'),
    oversizedOuter,
    bytes(oversizedInner),
  ]) {
    assert.equal(adapter.sanitizeRecord(input, provenance()), undefined);
  }
});

test('counts every outer byte before parsing and drops bounded poison members', () => {
  const valid = {
    payload: bytes(flyEvent()),
    provenance: provenance(),
  };
  const poisonPayload = bytes(
    `${JSON.stringify(flyEvent()).slice(0, -1)},"private":"${'x'.repeat(7_000)}"}`,
  );
  assert.ok(poisonPayload.byteLength < FLY_LOG_MAX_ENVELOPE_BYTES);
  const poison = { payload: poisonPayload, provenance: provenance() };
  assert.deepEqual(adapter.sanitizeBatch([poison, valid]), [
    adapter.sanitizeRecord(valid.payload, valid.provenance),
  ]);

  const count =
    Math.floor(FLY_LOG_MAX_BATCH_INPUT_BYTES / poisonPayload.byteLength) + 1;
  assert.ok(count < 256);
  assert.deepEqual(
    adapter.sanitizeBatch([
      ...Array.from({ length: count }, () => poison),
      valid,
    ]),
    [],
  );
});

test('counts every bounded subject even when its envelope is discarded', () => {
  const valid = { payload: bytes(flyEvent()), provenance: provenance() };
  const poisonPayload = new Uint8Array(8_170).fill(32);
  const poison = { payload: poisonPayload, provenance: provenance() };
  const poisonCount = 32;
  const payloadBytes =
    poisonPayload.byteLength * poisonCount + valid.payload.byteLength;
  assert.ok(payloadBytes < FLY_LOG_MAX_BATCH_INPUT_BYTES);
  assert.ok(
    payloadBytes +
      encoder.encode(provenance().subject).byteLength * (poisonCount + 1) >
      FLY_LOG_MAX_BATCH_INPUT_BYTES,
  );
  assert.deepEqual(
    adapter.sanitizeBatch([
      ...Array.from({ length: poisonCount }, () => poison),
      valid,
    ]),
    [],
  );
});

test('refuses malformed batch entries and record-count overflow', () => {
  const valid = { payload: bytes(flyEvent()), provenance: provenance() };
  for (const entries of [
    [],
    [valid, { payload: 'not-bytes', provenance: provenance() }],
    [valid, { ...valid, extra: true }],
    Array.from({ length: 257 }, () => valid),
  ]) {
    assert.deepEqual(adapter.sanitizeBatch(entries), []);
  }
});
