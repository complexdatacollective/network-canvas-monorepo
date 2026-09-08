import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import { STUDIO_OPERATIONAL_DIAGNOSTIC_LEVELS } from '../apps/studio/server/src/observability/diagnostic-catalog.ts';
import { STUDIO_OPERATIONAL_ROUTES } from '../apps/studio/server/src/observability/routes.ts';
import { REGISTRY_OPERATIONAL_DIAGNOSTICS } from '../apps/template-registry/src/diagnostic-catalog.ts';
import { REGISTRY_OPERATIONAL_ROUTES } from '../apps/template-registry/src/observability/routes.ts';
import { REQUEST_ID } from '../packages/studio-sync/src/operational-http.ts';

export const MANAGED_LOG_MAX_INPUT_BYTES = 4_096;
export const MANAGED_LOG_MAX_BATCH_RECORDS = 256;
export const MANAGED_LOG_MAX_BATCH_INPUT_BYTES = 262_144;
const MANAGED_LOG_MAX_BATCH_OUTPUT_BYTES = 262_144;

const MANAGED_LOG_SERVICE_BINDINGS = Object.freeze({
  'studio-production': Object.freeze({
    product: 'studio',
    environment: 'production',
  }),
  'studio-staging': Object.freeze({
    product: 'studio',
    environment: 'staging',
  }),
  'registry-production': Object.freeze({
    product: 'registry',
    environment: 'production',
  }),
  'registry-staging': Object.freeze({
    product: 'registry',
    environment: 'staging',
  }),
});

const OUTPUT_FIELDS = Object.freeze({
  common: Object.freeze({
    schema_id: 'this schema identity',
    service: 'managed service enum',
    environment: 'service-bound environment enum',
    timestamp: 'integer epoch milliseconds, canonical source UTC instant',
    event: 'http_request | operational',
  }),
  request: Object.freeze({
    request_id: 'lowercase UUID',
    route: 'product route enum',
    method: 'HTTP method enum',
    status: 'integer 100..599',
    duration_ms: 'finite number 0..86400000, at most 3 decimal places',
  }),
  diagnostic: Object.freeze({
    request_id: 'optional lowercase UUID',
    diagnostic: 'product diagnostic enum',
  }),
});

export const MANAGED_OPERATIONAL_LOG_SCHEMA = Object.freeze({
  version: 1,
  services: Object.freeze(
    Object.entries(MANAGED_LOG_SERVICE_BINDINGS).map(([service, binding]) =>
      Object.freeze({ service, ...binding }),
    ),
  ),
  studioDiagnostics: Object.freeze(
    Object.entries(STUDIO_OPERATIONAL_DIAGNOSTIC_LEVELS).map(([code, level]) =>
      Object.freeze({ code, level }),
    ),
  ),
  registryDiagnostics: REGISTRY_OPERATIONAL_DIAGNOSTICS,
  studioRoutes: STUDIO_OPERATIONAL_ROUTES,
  registryRoutes: REGISTRY_OPERATIONAL_ROUTES,
  methods: Object.freeze([
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'CONNECT',
    'TRACE',
    'OTHER',
  ]),
  outputFields: OUTPUT_FIELDS,
  limits: Object.freeze({
    inputBytes: MANAGED_LOG_MAX_INPUT_BYTES,
    batchRecords: MANAGED_LOG_MAX_BATCH_RECORDS,
    batchInputBytes: MANAGED_LOG_MAX_BATCH_INPUT_BYTES,
    batchOutputBytes: MANAGED_LOG_MAX_BATCH_OUTPUT_BYTES,
    maximumDurationMs: 86_400_000,
  }),
});

function hashSchema(schema) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(schema))
    .digest('hex')}`;
}

// A schema change is a reviewed collector/destination contract change. Update
// this literal only with the matching catalog, parser and adversarial tests.
export const MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY =
  'sha256:bafeabbe5b6c90ddc908b0ae45a88eeabd8a69f88db6bd77a48029845f8f685e';

if (
  hashSchema(MANAGED_OPERATIONAL_LOG_SCHEMA) !==
  MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY
) {
  throw new Error('Managed operational log schema identity is stale');
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const METHODS = new Set(MANAGED_OPERATIONAL_LOG_SCHEMA.methods);
const STUDIO_ROUTES = new Set(STUDIO_OPERATIONAL_ROUTES);
const REGISTRY_ROUTES = new Set(REGISTRY_OPERATIONAL_ROUTES);
const REGISTRY_DIAGNOSTICS = new Set(REGISTRY_OPERATIONAL_DIAGNOSTICS);
const PINO_LEVELS = Object.freeze({ info: 30, warn: 40, error: 50 });
const TEAM_ID = /^[\w-]{1,128}$/;
const ISO_TIMESTAMP =
  /^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;

const STUDIO_REQUEST_KEYS = new Set([
  'level',
  'time',
  'event',
  'request_id',
  'route',
  'method',
  'status',
  'duration_ms',
  'team_id',
]);
const STUDIO_DIAGNOSTIC_KEYS = new Set([
  'level',
  'time',
  'event',
  'code',
  'request_id',
  'team_id',
]);
const REGISTRY_REQUEST_KEYS = new Set([
  'timestamp',
  'event',
  'request_id',
  'route',
  'method',
  'status',
  'duration_ms',
]);
const REGISTRY_DIAGNOSTIC_KEYS = new Set(['timestamp', 'code', 'request_id']);

function plainRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(record, allowed) {
  return Object.keys(record).every((key) => allowed.has(key));
}

function exactBinding(binding) {
  if (!plainRecord(binding)) return undefined;
  const keys = Object.keys(binding);
  if (
    keys.length !== 2 ||
    !keys.includes('service') ||
    !keys.includes('environment') ||
    typeof binding.service !== 'string' ||
    typeof binding.environment !== 'string'
  )
    return undefined;
  const expected = MANAGED_LOG_SERVICE_BINDINGS[binding.service];
  if (!expected || expected.environment !== binding.environment)
    return undefined;
  return { service: binding.service, ...expected };
}

function timestamp(value) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) &&
    new Date(milliseconds).toISOString() === value
    ? milliseconds
    : undefined;
}

function validCorrelation(record) {
  return (
    (record.request_id === undefined ||
      (typeof record.request_id === 'string' &&
        REQUEST_ID.test(record.request_id))) &&
    (record.team_id === undefined ||
      (typeof record.team_id === 'string' && TEAM_ID.test(record.team_id)))
  );
}

function requestFields(record, routes) {
  if (
    typeof record.request_id !== 'string' ||
    !REQUEST_ID.test(record.request_id) ||
    typeof record.route !== 'string' ||
    !routes.has(record.route) ||
    typeof record.method !== 'string' ||
    !METHODS.has(record.method) ||
    !Number.isInteger(record.status) ||
    record.status < 100 ||
    record.status > 599 ||
    typeof record.duration_ms !== 'number' ||
    !Number.isFinite(record.duration_ms) ||
    record.duration_ms < 0 ||
    record.duration_ms >
      MANAGED_OPERATIONAL_LOG_SCHEMA.limits.maximumDurationMs ||
    Math.round(record.duration_ms * 1_000) / 1_000 !== record.duration_ms ||
    !validCorrelation(record)
  )
    return undefined;
  return {
    request_id: record.request_id.toLowerCase(),
    route: record.route,
    method: record.method,
    status: record.status,
    duration_ms: record.duration_ms,
  };
}

function baseOutput(binding, timestampValue, event) {
  return {
    schema_id: MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
    service: binding.service,
    environment: binding.environment,
    timestamp: timestampValue,
    event,
  };
}

function sanitizeStudio(record, binding) {
  if (record.event === 'http_request') {
    if (
      !hasOnlyKeys(record, STUDIO_REQUEST_KEYS) ||
      record.level !== PINO_LEVELS.info
    )
      return undefined;
    const observedAt = timestamp(record.time);
    const fields = requestFields(record, STUDIO_ROUTES);
    if (observedAt === undefined || !fields) return undefined;
    return { ...baseOutput(binding, observedAt, 'http_request'), ...fields };
  }
  if (
    record.event !== 'operational' ||
    !hasOnlyKeys(record, STUDIO_DIAGNOSTIC_KEYS) ||
    typeof record.code !== 'string'
  )
    return undefined;
  const diagnosticLevel = STUDIO_OPERATIONAL_DIAGNOSTIC_LEVELS[record.code];
  if (!diagnosticLevel || record.level !== PINO_LEVELS[diagnosticLevel])
    return undefined;
  const observedAt = timestamp(record.time);
  if (observedAt === undefined || !validCorrelation(record)) return undefined;
  return {
    ...baseOutput(binding, observedAt, 'operational'),
    ...(record.request_id
      ? { request_id: record.request_id.toLowerCase() }
      : {}),
    diagnostic: record.code,
  };
}

function sanitizeRegistry(record, binding) {
  if (record.event === 'http_request') {
    if (!hasOnlyKeys(record, REGISTRY_REQUEST_KEYS)) return undefined;
    const observedAt = timestamp(record.timestamp);
    const fields = requestFields(record, REGISTRY_ROUTES);
    if (observedAt === undefined || !fields) return undefined;
    return { ...baseOutput(binding, observedAt, 'http_request'), ...fields };
  }
  if (
    record.event !== undefined ||
    !hasOnlyKeys(record, REGISTRY_DIAGNOSTIC_KEYS) ||
    typeof record.code !== 'string' ||
    !REGISTRY_DIAGNOSTICS.has(record.code)
  )
    return undefined;
  const observedAt = timestamp(record.timestamp);
  if (observedAt === undefined || !validCorrelation(record)) return undefined;
  return {
    ...baseOutput(binding, observedAt, 'operational'),
    ...(record.request_id
      ? { request_id: record.request_id.toLowerCase() }
      : {}),
    diagnostic: record.code,
  };
}

/**
 * Convert one already-framed private application log line to the sole public
 * forwarding schema. This function never returns source text or an error.
 */
export function sanitizeManagedLogRecord(input, binding) {
  const selected = exactBinding(binding);
  if (
    !selected ||
    !(input instanceof Uint8Array) ||
    input.byteLength === 0 ||
    input.byteLength > MANAGED_LOG_MAX_INPUT_BYTES
  )
    return undefined;
  try {
    const record = JSON.parse(utf8.decode(input));
    if (!plainRecord(record)) return undefined;
    return selected.product === 'studio'
      ? sanitizeStudio(record, selected)
      : sanitizeRegistry(record, selected);
  } catch {
    return undefined;
  }
}

/** Refuse an oversized batch before decoding any member; drop poison members. */
export function sanitizeManagedLogBatch(inputs, binding) {
  if (
    !Array.isArray(inputs) ||
    inputs.length === 0 ||
    inputs.length > MANAGED_LOG_MAX_BATCH_RECORDS ||
    !exactBinding(binding)
  )
    return [];
  let inputBytes = 0;
  for (const input of inputs) {
    if (!(input instanceof Uint8Array)) return [];
    inputBytes += input.byteLength;
    if (
      input.byteLength === 0 ||
      input.byteLength > MANAGED_LOG_MAX_INPUT_BYTES ||
      inputBytes > MANAGED_LOG_MAX_BATCH_INPUT_BYTES
    )
      return [];
  }
  const records = [];
  let outputBytes = 2;
  for (const input of inputs) {
    const record = sanitizeManagedLogRecord(input, binding);
    if (!record) continue;
    outputBytes += Buffer.byteLength(JSON.stringify(record)) + 1;
    if (outputBytes > MANAGED_LOG_MAX_BATCH_OUTPUT_BYTES) return [];
    records.push(record);
  }
  return records;
}
