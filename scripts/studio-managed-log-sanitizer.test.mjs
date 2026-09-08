import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MANAGED_LOG_MAX_BATCH_INPUT_BYTES,
  MANAGED_LOG_MAX_BATCH_RECORDS,
  MANAGED_LOG_MAX_INPUT_BYTES,
  MANAGED_OPERATIONAL_LOG_SCHEMA,
  MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
  sanitizeManagedLogBatch,
  sanitizeManagedLogRecord,
} from './studio-managed-log-sanitizer.mjs';

const encoder = new TextEncoder();
const requestId = '123e4567-e89b-42d3-a456-426614174000';
const observedAt = '2026-09-08T12:34:56.789Z';
const timestamp = Date.parse(observedAt);

const line = (record) => encoder.encode(JSON.stringify(record));
const binding = (service, environment) => ({ service, environment });

const studioRequest = (changes = {}) => ({
  level: 30,
  time: observedAt,
  event: 'http_request',
  request_id: requestId,
  route: '/rpc/studies/create',
  method: 'POST',
  status: 201,
  duration_ms: 12.345,
  ...changes,
});

const registryRequest = (changes = {}) => ({
  timestamp: observedAt,
  event: 'http_request',
  request_id: requestId,
  route: '/api/v1/entries/:id/*',
  method: 'GET',
  status: 200,
  duration_ms: 4.25,
  ...changes,
});

test('publishes a pinned exact output schema over the emitter-owned catalogs', () => {
  assert.equal(
    MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
    'sha256:bafeabbe5b6c90ddc908b0ae45a88eeabd8a69f88db6bd77a48029845f8f685e',
  );
  assert.deepEqual(
    MANAGED_OPERATIONAL_LOG_SCHEMA.services.map(({ service }) => service),
    [
      'studio-production',
      'studio-staging',
      'registry-production',
      'registry-staging',
    ],
  );
  assert.ok(
    MANAGED_OPERATIONAL_LOG_SCHEMA.studioRoutes.includes('/rpc/studies/create'),
  );
  assert.ok(
    MANAGED_OPERATIONAL_LOG_SCHEMA.registryRoutes.includes(
      '/api/v1/entries/:id/*',
    ),
  );
  const outputFields = JSON.stringify(
    MANAGED_OPERATIONAL_LOG_SCHEMA.outputFields,
  );
  for (const forbidden of [
    'message',
    'url',
    'header',
    'body',
    'exception',
    'provider',
    'team_id',
  ])
    assert.equal(outputFields.includes(forbidden), false);
});

test('declares every field emitted by each event schema', () => {
  const fixtures = [
    {
      eventFields: MANAGED_OPERATIONAL_LOG_SCHEMA.outputFields.request,
      output: sanitizeManagedLogRecord(
        line(studioRequest()),
        binding('studio-production', 'production'),
      ),
    },
    {
      eventFields: MANAGED_OPERATIONAL_LOG_SCHEMA.outputFields.diagnostic,
      output: sanitizeManagedLogRecord(
        line({
          level: 50,
          time: observedAt,
          event: 'operational',
          code: 'STUDIO_DATABASE_UNREACHABLE',
          request_id: requestId,
        }),
        binding('studio-production', 'production'),
      ),
    },
    {
      eventFields: MANAGED_OPERATIONAL_LOG_SCHEMA.outputFields.diagnostic,
      output: sanitizeManagedLogRecord(
        line({
          timestamp: observedAt,
          code: 'REGISTRY_RECOVERY_FAILED',
          request_id: requestId,
        }),
        binding('registry-production', 'production'),
      ),
    },
  ];
  assert.ok(fixtures.every(({ output }) => output !== undefined));
  for (const { eventFields, output } of fixtures) {
    const declared = new Set([
      ...Object.keys(MANAGED_OPERATIONAL_LOG_SCHEMA.outputFields.common),
      ...Object.keys(eventFields),
    ]);
    assert.deepEqual(
      Object.keys(output).filter((field) => !declared.has(field)),
      [],
    );
  }
});

test('accepts only the four service and environment bindings', () => {
  const fixtures = [
    ['studio-production', 'production', studioRequest()],
    ['studio-staging', 'staging', studioRequest()],
    ['registry-production', 'production', registryRequest()],
    ['registry-staging', 'staging', registryRequest()],
  ];
  for (const [service, environment, record] of fixtures) {
    const output = sanitizeManagedLogRecord(
      line(record),
      binding(service, environment),
    );
    assert.equal(output?.service, service);
    assert.equal(output?.environment, environment);
  }

  for (const badBinding of [
    binding('studio-production', 'staging'),
    binding('studio-preview', 'production'),
    { service: 'studio-production' },
    { service: 'studio-production', environment: 'production', label: 'evil' },
    null,
  ])
    assert.equal(
      sanitizeManagedLogRecord(line(studioRequest()), badBinding),
      undefined,
    );
});

test('emits only fixed New Relic-compatible request attributes', () => {
  const output = sanitizeManagedLogRecord(
    line(studioRequest({ team_id: 'private-team-canary' })),
    binding('studio-production', 'production'),
  );
  assert.deepEqual(output, {
    schema_id: MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
    service: 'studio-production',
    environment: 'production',
    timestamp,
    event: 'http_request',
    request_id: requestId,
    route: '/rpc/studies/create',
    method: 'POST',
    status: 201,
    duration_ms: 12.345,
  });
  assert.equal(JSON.stringify(output).includes('private-team-canary'), false);
});

test('emits only approved fixed diagnostic identifiers', () => {
  const studio = sanitizeManagedLogRecord(
    line({
      level: 50,
      time: observedAt,
      event: 'operational',
      code: 'STUDIO_DATABASE_UNREACHABLE',
      request_id: requestId.toUpperCase(),
      team_id: 'private-team-canary',
    }),
    binding('studio-staging', 'staging'),
  );
  assert.deepEqual(studio, {
    schema_id: MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
    service: 'studio-staging',
    environment: 'staging',
    timestamp,
    event: 'operational',
    request_id: requestId,
    diagnostic: 'STUDIO_DATABASE_UNREACHABLE',
  });

  const registry = sanitizeManagedLogRecord(
    line({
      timestamp: observedAt,
      code: 'REGISTRY_RECOVERY_FAILED',
      request_id: requestId,
    }),
    binding('registry-production', 'production'),
  );
  assert.deepEqual(registry, {
    schema_id: MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
    service: 'registry-production',
    environment: 'production',
    timestamp,
    event: 'operational',
    request_id: requestId,
    diagnostic: 'REGISTRY_RECOVERY_FAILED',
  });
});

test('accepts every current emitter route and diagnostic catalog entry', () => {
  const pinoLevels = { info: 30, warn: 40, error: 50 };
  for (const route of MANAGED_OPERATIONAL_LOG_SCHEMA.studioRoutes)
    assert.equal(
      sanitizeManagedLogRecord(
        line(studioRequest({ route })),
        binding('studio-production', 'production'),
      )?.route,
      route,
    );
  for (const route of MANAGED_OPERATIONAL_LOG_SCHEMA.registryRoutes)
    assert.equal(
      sanitizeManagedLogRecord(
        line(registryRequest({ route })),
        binding('registry-production', 'production'),
      )?.route,
      route,
    );
  for (const {
    code,
    level,
  } of MANAGED_OPERATIONAL_LOG_SCHEMA.studioDiagnostics)
    assert.equal(
      sanitizeManagedLogRecord(
        line({
          level: pinoLevels[level],
          time: observedAt,
          event: 'operational',
          code,
        }),
        binding('studio-production', 'production'),
      )?.diagnostic,
      code,
    );
  for (const code of MANAGED_OPERATIONAL_LOG_SCHEMA.registryDiagnostics)
    assert.equal(
      sanitizeManagedLogRecord(line({ timestamp: observedAt, code }), {
        service: 'registry-production',
        environment: 'production',
      })?.diagnostic,
      code,
    );
});

test('drops tainted and unknown source fields without echoing their values', () => {
  const canaries = [
    ['message', 'raw-message-canary'],
    ['url', 'https://secret.invalid/raw-url-canary?token=1'],
    ['headers', { authorization: 'header-secret-canary' }],
    ['body', { answer: 'body-secret-canary' }],
    ['exception', { stack: 'exception-secret-canary' }],
    ['provider_reply', 'provider-secret-canary'],
    ['service', 'attacker-service-canary'],
    ['__proto_pollution', 'prototype-secret-canary'],
  ];
  const outputs = [];
  for (const [field, value] of canaries) {
    const output = sanitizeManagedLogRecord(
      line(studioRequest({ [field]: value })),
      binding('studio-production', 'production'),
    );
    assert.equal(output, undefined, field);
    outputs.push(output);
  }
  const serialized = JSON.stringify(outputs);
  for (const [, value] of canaries) {
    const secret = typeof value === 'string' ? value : Object.values(value)[0];
    assert.equal(serialized.includes(secret), false);
  }
});

test('rejects duplicate inner members including Unicode-equivalent keys', () => {
  const raw = JSON.stringify(studioRequest())
    .replace(
      '"event":"http_request"',
      '"\\u0065vent":"private-event-canary","event":"http_request"',
    )
    .replace(
      '"route":"/rpc/studies/create"',
      '"route":"/private?token=route-secret-canary","route":"/rpc/studies/create"',
    );
  const output = sanitizeManagedLogRecord(
    encoder.encode(raw),
    binding('studio-production', 'production'),
  );
  assert.equal(output, undefined);
  assert.equal(JSON.stringify([output]).includes('secret-canary'), false);
});

test('drops invalid request and diagnostic shapes', () => {
  const invalidStudio = [
    studioRequest({ request_id: 'not-a-uuid' }),
    studioRequest({ route: '/storage/private-object-hash' }),
    studioRequest({ method: 'BREW' }),
    studioRequest({ status: 99 }),
    studioRequest({ duration_ms: -1 }),
    studioRequest({ duration_ms: 0.0001 }),
    studioRequest({ time: 'yesterday' }),
    studioRequest({ team_id: 'contains spaces' }),
    { ...studioRequest(), event: 'operational' },
    {
      level: 30,
      time: observedAt,
      event: 'operational',
      code: 'STUDIO_DATABASE_UNREACHABLE',
    },
    {
      level: 50,
      time: observedAt,
      event: 'operational',
      code: 'STUDIO_UNREVIEWED_DIAGNOSTIC',
    },
  ];
  for (const record of invalidStudio)
    assert.equal(
      sanitizeManagedLogRecord(
        line(record),
        binding('studio-production', 'production'),
      ),
      undefined,
    );

  const invalidRegistry = [
    registryRequest({ route: '/api/v1/entries/private-id' }),
    registryRequest({ request_id: undefined }),
    { timestamp: observedAt, code: 'REGISTRY_UNREVIEWED_DIAGNOSTIC' },
    {
      timestamp: observedAt,
      event: 'operational',
      code: 'REGISTRY_RECOVERY_FAILED',
    },
  ];
  for (const record of invalidRegistry)
    assert.equal(
      sanitizeManagedLogRecord(
        line(record),
        binding('registry-production', 'production'),
      ),
      undefined,
    );
});

test('bounds bytes before decoding and refuses malformed framing', () => {
  const validJson = JSON.stringify(studioRequest());
  const overlongValidRecord = encoder.encode(
    `${validJson}${' '.repeat(MANAGED_LOG_MAX_INPUT_BYTES + 1 - validJson.length)}`,
  );
  assert.equal(
    sanitizeManagedLogRecord(
      overlongValidRecord,
      binding('studio-production', 'production'),
    ),
    undefined,
  );
  assert.equal(
    sanitizeManagedLogRecord(
      Uint8Array.from([0xc3, 0x28]),
      binding('studio-production', 'production'),
    ),
    undefined,
  );
  for (const malformed of [new Uint8Array(), '{"event":"http_request"}', null])
    assert.equal(
      sanitizeManagedLogRecord(
        malformed,
        binding('studio-production', 'production'),
      ),
      undefined,
    );
});

test('bounds whole batches before parse and drops poison members', () => {
  const valid = line(studioRequest());
  const poison = line({ message: 'batch-secret-canary' });
  const records = sanitizeManagedLogBatch(
    [valid, poison, valid],
    binding('studio-production', 'production'),
  );
  assert.equal(records.length, 2);
  assert.equal(JSON.stringify(records).includes('batch-secret-canary'), false);

  assert.deepEqual(
    sanitizeManagedLogBatch(
      Array.from({ length: MANAGED_LOG_MAX_BATCH_RECORDS + 1 }, () => valid),
      binding('studio-production', 'production'),
    ),
    [],
  );
  const paddedValidJson = `${JSON.stringify(studioRequest())}${' '.repeat(
    MANAGED_LOG_MAX_INPUT_BYTES - JSON.stringify(studioRequest()).length,
  )}`;
  const totalLimitLines = Array.from(
    {
      length:
        Math.floor(
          MANAGED_LOG_MAX_BATCH_INPUT_BYTES / MANAGED_LOG_MAX_INPUT_BYTES,
        ) + 1,
    },
    () => encoder.encode(paddedValidJson),
  );
  assert.deepEqual(
    sanitizeManagedLogBatch(
      totalLimitLines,
      binding('studio-production', 'production'),
    ),
    [],
  );
});
