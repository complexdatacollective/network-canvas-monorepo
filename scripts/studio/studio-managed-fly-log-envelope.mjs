import { TextDecoder, TextEncoder } from 'node:util';

import {
  MANAGED_LOG_MAX_BATCH_RECORDS,
  MANAGED_LOG_SERVICE_BINDINGS,
  MANAGED_OPERATIONAL_LOG_SCHEMA,
  sanitizeManagedLogRecord,
} from './studio-managed-log-sanitizer.mjs';
import { hasDuplicateJsonObjectKeys } from './studio-managed-strict-json.mjs';

const FLY_LOG_REGION = 'iad';
export const FLY_LOG_MAX_ENVELOPE_BYTES = 8_192;
export const FLY_LOG_MAX_BATCH_INPUT_BYTES = 262_144;
export const FLY_LOG_MAX_SUBJECT_CHARACTERS = 87;
export const AUTHENTICATED_FLY_NATS_TRANSPORT =
  'authenticated-fly-nats-subscription';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const SERVICE_NAMES = Object.freeze(Object.keys(MANAGED_LOG_SERVICE_BINDINGS));
const SERVICE_NAME_SET = new Set(SERVICE_NAMES);
const OUTER_KEYS = new Set([
  'event',
  'fly',
  'host',
  'level',
  'log',
  'message',
  'timestamp',
]);
const REQUIRED_OUTER_KEYS = [
  'event',
  'fly',
  'host',
  'log',
  'message',
  'timestamp',
];
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const FLY_APP = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MACHINE_ID = /^[0-9a-f]{14}$/;
const HOST = /^[a-zA-Z0-9._:-]{1,128}$/;
const FLY_TIMESTAMP =
  /^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/;

export const MANAGED_FLY_LOG_ENVELOPE_CONTRACT = Object.freeze({
  version: 1,
  transport: AUTHENTICATED_FLY_NATS_TRANSPORT,
  subject: 'logs.<configured-app>.iad.<14-lowercase-hex-machine-id>',
  region: FLY_LOG_REGION,
  services: SERVICE_NAMES,
  requiredOuterFields: Object.freeze([...REQUIRED_OUTER_KEYS]),
  optionalOuterFields: Object.freeze(['level']),
  levels: Object.freeze([...LOG_LEVELS]),
  limits: Object.freeze({
    envelopeBytes: FLY_LOG_MAX_ENVELOPE_BYTES,
    subjectCharacters: FLY_LOG_MAX_SUBJECT_CHARACTERS,
    batchRecords: MANAGED_LOG_MAX_BATCH_RECORDS,
    batchInputBytes: FLY_LOG_MAX_BATCH_INPUT_BYTES,
  }),
});

function plainRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(record, required, allowed = new Set(required)) {
  const keys = Object.keys(record);
  return (
    required.every((key) => Object.hasOwn(record, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !FLY_TIMESTAMP.test(value)) return false;
  const observed = Date.parse(value);
  return (
    Number.isFinite(observed) &&
    new Date(observed).toISOString().slice(0, 10) === value.slice(0, 10)
  );
}

function resolveConfiguration(configuration) {
  if (
    !plainRecord(configuration) ||
    !exactKeys(configuration, ['region', 'applications']) ||
    configuration.region !== FLY_LOG_REGION ||
    !plainRecord(configuration.applications) ||
    Object.keys(configuration.applications).length !== SERVICE_NAMES.length ||
    !SERVICE_NAMES.every((service) =>
      Object.hasOwn(configuration.applications, service),
    )
  ) {
    throw new Error('invalid managed Fly log configuration');
  }
  const applications = {};
  const observed = new Set();
  for (const service of SERVICE_NAMES) {
    const application = configuration.applications[service];
    if (
      typeof application !== 'string' ||
      !FLY_APP.test(application) ||
      observed.has(application)
    ) {
      throw new Error(
        'managed Fly log applications must be exact and distinct',
      );
    }
    applications[service] = application;
    observed.add(application);
  }
  return Object.freeze({
    region: FLY_LOG_REGION,
    applications: Object.freeze(applications),
  });
}

function boundedProvenanceSubject(provenance) {
  if (
    !plainRecord(provenance) ||
    !exactKeys(provenance, ['transport', 'subject']) ||
    provenance.transport !== AUTHENTICATED_FLY_NATS_TRANSPORT ||
    typeof provenance.subject !== 'string' ||
    provenance.subject.length > FLY_LOG_MAX_SUBJECT_CHARACTERS
  )
    return undefined;
  return provenance.subject;
}

function bindingFromProvenance(provenance, configuration) {
  const subject = boundedProvenanceSubject(provenance);
  if (subject === undefined) return undefined;
  const parts = subject.split('.');
  if (
    parts.length !== 4 ||
    parts[0] !== 'logs' ||
    parts[2] !== configuration.region ||
    !MACHINE_ID.test(parts[3])
  )
    return undefined;
  const service = SERVICE_NAMES.find(
    (candidate) => configuration.applications[candidate] === parts[1],
  );
  if (!service || !SERVICE_NAME_SET.has(service)) return undefined;
  const managed = MANAGED_LOG_SERVICE_BINDINGS[service];
  return {
    service,
    environment: managed.environment,
    application: parts[1],
    instance: parts[3],
  };
}

function innerApplicationBytes(payload, provenance, configuration) {
  const binding = bindingFromProvenance(provenance, configuration);
  if (!binding) return undefined;
  let source;
  let event;
  try {
    source = utf8.decode(payload);
    if (hasDuplicateJsonObjectKeys(source)) return undefined;
    event = JSON.parse(source);
  } catch {
    return undefined;
  }
  if (
    !plainRecord(event) ||
    !exactKeys(event, REQUIRED_OUTER_KEYS, OUTER_KEYS) ||
    !plainRecord(event.event) ||
    !exactKeys(event.event, ['provider']) ||
    event.event.provider !== 'app' ||
    !plainRecord(event.fly) ||
    !exactKeys(event.fly, ['app', 'region']) ||
    event.fly.region !== configuration.region ||
    !plainRecord(event.fly.app) ||
    !exactKeys(event.fly.app, ['instance', 'name']) ||
    event.fly.app.name !== binding.application ||
    event.fly.app.instance !== binding.instance ||
    typeof event.host !== 'string' ||
    !HOST.test(event.host) ||
    !plainRecord(event.log) ||
    !exactKeys(event.log, ['level']) ||
    typeof event.log.level !== 'string' ||
    !LOG_LEVELS.has(event.log.level) ||
    (event.level !== undefined && event.level !== event.log.level) ||
    !validTimestamp(event.timestamp) ||
    typeof event.message !== 'string'
  )
    return undefined;
  const inner = encoder.encode(event.message);
  if (
    inner.byteLength === 0 ||
    inner.byteLength > MANAGED_OPERATIONAL_LOG_SCHEMA.limits.inputBytes
  )
    return undefined;
  return {
    inner,
    sanitizerBinding: {
      service: binding.service,
      environment: binding.environment,
    },
  };
}

function sanitizeOne(payload, provenance, configuration) {
  if (
    !(payload instanceof Uint8Array) ||
    payload.byteLength === 0 ||
    payload.byteLength > FLY_LOG_MAX_ENVELOPE_BYTES
  )
    return undefined;
  const extracted = innerApplicationBytes(payload, provenance, configuration);
  if (!extracted) return undefined;
  return sanitizeManagedLogRecord(extracted.inner, extracted.sanitizerBinding);
}

/**
 * Bind Fly envelopes to authenticated NATS subjects before sanitizing their
 * inner application line. Network authentication and subscription ownership
 * remain the caller's responsibility.
 */
export function createAuthenticatedFlyLogAdapter(configuration) {
  const selected = resolveConfiguration(configuration);
  return Object.freeze({
    sanitizeRecord(payload, provenance) {
      return sanitizeOne(payload, provenance, selected);
    },
    sanitizeBatch(entries) {
      if (
        !Array.isArray(entries) ||
        entries.length === 0 ||
        entries.length > MANAGED_LOG_MAX_BATCH_RECORDS
      )
        return [];
      let inputBytes = 0;
      for (const entry of entries) {
        const subject = plainRecord(entry)
          ? boundedProvenanceSubject(entry.provenance)
          : undefined;
        if (
          !plainRecord(entry) ||
          !exactKeys(entry, ['payload', 'provenance']) ||
          !(entry.payload instanceof Uint8Array) ||
          entry.payload.byteLength === 0 ||
          entry.payload.byteLength > FLY_LOG_MAX_ENVELOPE_BYTES ||
          subject === undefined
        )
          return [];
        inputBytes +=
          entry.payload.byteLength + encoder.encode(subject).byteLength;
        if (inputBytes > FLY_LOG_MAX_BATCH_INPUT_BYTES) return [];
      }
      const records = [];
      let outputBytes = 2;
      for (const entry of entries) {
        const record = sanitizeOne(entry.payload, entry.provenance, selected);
        if (!record) continue;
        outputBytes += Buffer.byteLength(JSON.stringify(record)) + 1;
        if (
          outputBytes > MANAGED_OPERATIONAL_LOG_SCHEMA.limits.batchOutputBytes
        )
          return [];
        records.push(record);
      }
      return records;
    },
  });
}
