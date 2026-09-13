#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { connect as connectNats } from '@nats-io/transport-node';

import { createObservabilityAnchorClient } from '../../apps/studio/deployment/managed/observability-anchor-client.mjs';
import { openMonthlyEgressBudget } from '../../apps/studio/deployment/managed/observability-egress-budget.mjs';
import {
  createNewRelicLogTransport,
  NEW_RELIC_LOG_WIRE_SCHEMA_IDENTITY,
} from '../../apps/studio/deployment/managed/observability-new-relic-logs.mjs';
import { createNewRelicUsageReader } from '../../apps/studio/deployment/managed/observability-new-relic-usage.mjs';
import {
  AUTHENTICATED_FLY_NATS_TRANSPORT,
  FLY_LOG_MAX_BATCH_INPUT_BYTES,
  FLY_LOG_MAX_ENVELOPE_BYTES,
} from './studio-managed-fly-log-envelope.mjs';
import { MANAGED_LOG_MAX_BATCH_RECORDS } from './studio-managed-log-sanitizer.mjs';

const FLY_NATS_SERVER = 'nats://[fdaa::3]:4223';
const NEW_RELIC_FREE_INGEST_LIMIT_BYTES = 100_000_000_000;
const BASIS_POINTS = 10_000;
const SHA256 = /^[a-f0-9]{64}$/;
const FLY_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SECRET = /^[\x21-\x7e]{32,4096}$/;
const ENVIRONMENT_KEYS = Object.freeze([
  'FLY_ORG',
  'FLY_NATS_TOKEN',
  'STUDIO_FLY_PRODUCTION_APP',
  'STUDIO_FLY_STAGING_APP',
  'REGISTRY_FLY_PRODUCTION_APP',
  'REGISTRY_FLY_STAGING_APP',
  'NEW_RELIC_ACCOUNT_ID',
  'NEW_RELIC_LICENSE_KEY',
  'NEW_RELIC_USER_KEY',
  'OBSERVABILITY_ANCHOR_URL',
  'OBSERVABILITY_ANCHOR_FORWARDER_TOKEN',
  'STUDIO_OBSERVABILITY_BUDGET_DIRECTORY',
  'STUDIO_OBSERVABILITY_MONTHLY_LIMIT_BYTES',
  'STUDIO_OBSERVABILITY_FINAL_SIGNAL_RESERVE_BYTES',
  'STUDIO_NEW_RELIC_STOP_BEFORE_BYTES',
  'STUDIO_NEW_RELIC_USAGE_LAG_RESERVE_BYTES',
  'STUDIO_NEW_RELIC_STORED_EXPANSION_BPS',
  'STUDIO_NEW_RELIC_EXPANSION_EVIDENCE_SHA256',
]);
const codes = new Set([
  'STUDIO_COLLECTOR_CONFIGURATION_INVALID',
  'STUDIO_COLLECTOR_NATS_UNAVAILABLE',
  'STUDIO_COLLECTOR_QUEUE_EXHAUSTED',
  'STUDIO_COLLECTOR_EGRESS_REFUSED',
]);

export class ManagedLogCollectorError extends Error {
  constructor(code) {
    const selected = codes.has(code) ? code : 'STUDIO_COLLECTOR_EGRESS_REFUSED';
    super(selected);
    this.name = 'ManagedLogCollectorError';
    this.code = selected;
  }
}

const refuse = (code) => {
  throw new ManagedLogCollectorError(code);
};
const integer = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;
const plainRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const objectRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) =>
  plainRecord(value) &&
  Object.keys(value)
    .toSorted((left, right) => left.localeCompare(right))
    .join(',') ===
    [...keys].toSorted((left, right) => left.localeCompare(right)).join(',');

function positiveEnvironmentInteger(environment, name) {
  const source = environment[name];
  if (typeof source !== 'string' || !/^[1-9]\d*$/.test(source))
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  const value = Number(source);
  if (!Number.isSafeInteger(value))
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  return value;
}

function requiredEnvironmentString(environment, name, pattern) {
  const value = environment[name];
  if (typeof value !== 'string' || !pattern.test(value))
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  return value;
}

export const MANAGED_LOG_COLLECTOR_ENVIRONMENT = ENVIRONMENT_KEYS;

export function managedLogCollectorConfigurationFromEnvironment(environment) {
  if (!objectRecord(environment))
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  const accountId = positiveEnvironmentInteger(
    environment,
    'NEW_RELIC_ACCOUNT_ID',
  );
  const monthlyLimitBytes = positiveEnvironmentInteger(
    environment,
    'STUDIO_OBSERVABILITY_MONTHLY_LIMIT_BYTES',
  );
  const finalSignalReserveBytes = positiveEnvironmentInteger(
    environment,
    'STUDIO_OBSERVABILITY_FINAL_SIGNAL_RESERVE_BYTES',
  );
  const providerStopBeforeBytes = positiveEnvironmentInteger(
    environment,
    'STUDIO_NEW_RELIC_STOP_BEFORE_BYTES',
  );
  const usageLagReserveBytes = positiveEnvironmentInteger(
    environment,
    'STUDIO_NEW_RELIC_USAGE_LAG_RESERVE_BYTES',
  );
  const storedExpansionBasisPoints = positiveEnvironmentInteger(
    environment,
    'STUDIO_NEW_RELIC_STORED_EXPANSION_BPS',
  );
  const applications = {
    'studio-production': requiredEnvironmentString(
      environment,
      'STUDIO_FLY_PRODUCTION_APP',
      FLY_NAME,
    ),
    'studio-staging': requiredEnvironmentString(
      environment,
      'STUDIO_FLY_STAGING_APP',
      FLY_NAME,
    ),
    'registry-production': requiredEnvironmentString(
      environment,
      'REGISTRY_FLY_PRODUCTION_APP',
      FLY_NAME,
    ),
    'registry-staging': requiredEnvironmentString(
      environment,
      'REGISTRY_FLY_STAGING_APP',
      FLY_NAME,
    ),
  };
  if (
    new Set(Object.values(applications)).size !== 4 ||
    accountId > 2_147_483_647 ||
    monthlyLimitBytes > 50_000_000_000 ||
    finalSignalReserveBytes >= monthlyLimitBytes ||
    providerStopBeforeBytes >= NEW_RELIC_FREE_INGEST_LIMIT_BYTES ||
    usageLagReserveBytes >= providerStopBeforeBytes ||
    storedExpansionBasisPoints < BASIS_POINTS ||
    storedExpansionBasisPoints > 1_000_000
  )
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  const configuration = {
    accountId,
    anchorEndpoint: requiredEnvironmentString(
      environment,
      'OBSERVABILITY_ANCHOR_URL',
      /^https:\/\/[^\s]+$/,
    ),
    anchorToken: requiredEnvironmentString(
      environment,
      'OBSERVABILITY_ANCHOR_FORWARDER_TOKEN',
      SECRET,
    ),
    budgetDirectory: requiredEnvironmentString(
      environment,
      'STUDIO_OBSERVABILITY_BUDGET_DIRECTORY',
      /^\/.+/,
    ),
    finalSignalReserveBytes,
    flyApplications: applications,
    flyOrg: requiredEnvironmentString(environment, 'FLY_ORG', FLY_NAME),
    flyToken: requiredEnvironmentString(environment, 'FLY_NATS_TOKEN', SECRET),
    licenseKey: requiredEnvironmentString(
      environment,
      'NEW_RELIC_LICENSE_KEY',
      SECRET,
    ),
    monthlyLimitBytes,
    providerStopBeforeBytes,
    storedExpansionBasisPoints,
    expansionEvidenceSha256: requiredEnvironmentString(
      environment,
      'STUDIO_NEW_RELIC_EXPANSION_EVIDENCE_SHA256',
      SHA256,
    ),
    usageLagReserveBytes,
    userKey: requiredEnvironmentString(
      environment,
      'NEW_RELIC_USER_KEY',
      SECRET,
    ),
  };
  return Object.freeze(configuration);
}

function managedLogCollectorPolicyIdentity(configuration) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        wireSchemaIdentity: NEW_RELIC_LOG_WIRE_SCHEMA_IDENTITY,
        provider: 'new-relic-us',
        providerFreeIngestLimitBytes: NEW_RELIC_FREE_INGEST_LIMIT_BYTES,
        providerStopBeforeBytes: configuration.providerStopBeforeBytes,
        usageLagReserveBytes: configuration.usageLagReserveBytes,
        storedExpansionBasisPoints: configuration.storedExpansionBasisPoints,
        expansionEvidenceSha256: configuration.expansionEvidenceSha256,
      }),
    )
    .digest('hex');
}

export function managedLogCollectorBudgetOptions(rawConfiguration) {
  const configuration = validatedConfiguration(rawConfiguration);
  return Object.freeze({
    accountIdentity: `new-relic:${configuration.accountId}`,
    configurationIdentity: managedLogCollectorPolicyIdentity(configuration),
    directory: configuration.budgetDirectory,
    finalSignalReserveBytes: configuration.finalSignalReserveBytes,
    monthlyLimitBytes: configuration.monthlyLimitBytes,
  });
}

function validatedConfiguration(configuration) {
  if (
    !exactKeys(configuration, [
      'accountId',
      'anchorEndpoint',
      'anchorToken',
      'budgetDirectory',
      'expansionEvidenceSha256',
      'finalSignalReserveBytes',
      'flyApplications',
      'flyOrg',
      'flyToken',
      'licenseKey',
      'monthlyLimitBytes',
      'providerStopBeforeBytes',
      'storedExpansionBasisPoints',
      'usageLagReserveBytes',
      'userKey',
    ]) ||
    !integer(configuration.accountId, 1) ||
    configuration.accountId > 2_147_483_647 ||
    typeof configuration.budgetDirectory !== 'string' ||
    !configuration.budgetDirectory.startsWith('/') ||
    !SHA256.test(configuration.expansionEvidenceSha256) ||
    !integer(configuration.monthlyLimitBytes, 2) ||
    configuration.monthlyLimitBytes > 50_000_000_000 ||
    !integer(configuration.finalSignalReserveBytes, 1) ||
    configuration.finalSignalReserveBytes >= configuration.monthlyLimitBytes ||
    !integer(configuration.providerStopBeforeBytes, 1) ||
    configuration.providerStopBeforeBytes >=
      NEW_RELIC_FREE_INGEST_LIMIT_BYTES ||
    !integer(configuration.usageLagReserveBytes, 1) ||
    configuration.usageLagReserveBytes >=
      configuration.providerStopBeforeBytes ||
    !integer(configuration.storedExpansionBasisPoints, BASIS_POINTS) ||
    configuration.storedExpansionBasisPoints > 1_000_000 ||
    !FLY_NAME.test(configuration.flyOrg) ||
    !SECRET.test(configuration.flyToken) ||
    !SECRET.test(configuration.licenseKey) ||
    !SECRET.test(configuration.userKey) ||
    !SECRET.test(configuration.anchorToken) ||
    !plainRecord(configuration.flyApplications) ||
    Object.keys(configuration.flyApplications).toSorted().join(',') !==
      [
        'registry-production',
        'registry-staging',
        'studio-production',
        'studio-staging',
      ].join(',') ||
    new Set(Object.values(configuration.flyApplications)).size !== 4 ||
    !Object.values(configuration.flyApplications).every(
      (application) =>
        typeof application === 'string' && FLY_NAME.test(application),
    )
  )
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  try {
    const endpoint = new URL(configuration.anchorEndpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname !== '/' ||
      endpoint.search ||
      endpoint.hash
    )
      refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  } catch (error) {
    if (error instanceof ManagedLogCollectorError) throw error;
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');
  }
  return configuration;
}

function createQueue({ maximumBytes, maximumRecords, wake, fail }) {
  const entries = [];
  let bytes = 0;
  return Object.freeze({
    push(entry) {
      const entryBytes =
        entry.payload.byteLength + Buffer.byteLength(entry.provenance.subject);
      if (
        entry.payload.byteLength === 0 ||
        entry.payload.byteLength > FLY_LOG_MAX_ENVELOPE_BYTES ||
        entries.length === maximumRecords ||
        bytes + entryBytes > maximumBytes
      ) {
        fail('STUDIO_COLLECTOR_QUEUE_EXHAUSTED');
        return;
      }
      entries.push(entry);
      bytes += entryBytes;
      wake();
    },
    shiftBatch() {
      const batch = [];
      let batchBytes = 0;
      while (
        entries.length > 0 &&
        batch.length < MANAGED_LOG_MAX_BATCH_RECORDS
      ) {
        const next = entries[0];
        const nextBytes =
          next.payload.byteLength + Buffer.byteLength(next.provenance.subject);
        if (
          batch.length > 0 &&
          batchBytes + nextBytes > FLY_LOG_MAX_BATCH_INPUT_BYTES
        )
          break;
        entries.shift();
        bytes -= nextBytes;
        batchBytes += nextBytes;
        batch.push(next);
      }
      return batch;
    },
    get length() {
      return entries.length;
    },
  });
}

function estimatedStoredBytes(wireBytes, basisPoints) {
  const estimate = Math.ceil((wireBytes * basisPoints) / BASIS_POINTS);
  if (!integer(estimate, wireBytes)) refuse('STUDIO_COLLECTOR_EGRESS_REFUSED');
  return estimate;
}

export async function runManagedLogCollector(
  rawConfiguration,
  {
    connect = connectNats,
    fetchAnchor = globalThis.fetch,
    fetchNewRelic = globalThis.fetch,
    launch,
    now = Date.now,
    signal,
    maximumQueueRecords = MANAGED_LOG_MAX_BATCH_RECORDS,
    maximumQueueBytes = FLY_LOG_MAX_BATCH_INPUT_BYTES,
  } = {},
) {
  const configuration = validatedConfiguration(rawConfiguration);
  if (
    typeof connect !== 'function' ||
    typeof fetchAnchor !== 'function' ||
    typeof fetchNewRelic !== 'function' ||
    (launch !== undefined && typeof launch !== 'function') ||
    typeof now !== 'function' ||
    (signal !== undefined && !(signal instanceof AbortSignal)) ||
    !integer(maximumQueueRecords, 1) ||
    maximumQueueRecords > MANAGED_LOG_MAX_BATCH_RECORDS ||
    !integer(maximumQueueBytes, FLY_LOG_MAX_ENVELOPE_BYTES) ||
    maximumQueueBytes > FLY_LOG_MAX_BATCH_INPUT_BYTES
  )
    refuse('STUDIO_COLLECTOR_CONFIGURATION_INVALID');

  const budgetOptions = managedLogCollectorBudgetOptions(configuration);
  const anchor = createObservabilityAnchorClient({
    accountIdentitySha256: createHash('sha256')
      .update(budgetOptions.accountIdentity)
      .digest('hex'),
    authority: 'forwarder',
    endpoint: configuration.anchorEndpoint,
    fetch: fetchAnchor,
    token: configuration.anchorToken,
  });
  const budget = await openMonthlyEgressBudget(budgetOptions, {
    runtimeAnchor: anchor,
    now: () => new Date(now()),
    ...(launch ? { launch } : {}),
  });
  const usage = createNewRelicUsageReader({
    accountId: configuration.accountId,
    fetch: fetchNewRelic,
    now,
    userKey: configuration.userKey,
  });
  let acceptingEgress = true;
  const logs = createNewRelicLogTransport({
    bindingSha256: budget.bindingSha256,
    flyConfiguration: {
      region: 'iad',
      applications: configuration.flyApplications,
    },
    licenseKey: configuration.licenseKey,
    fetch: fetchNewRelic,
    now,
    reserveAttempt: async (attempt) => {
      if (!acceptingEgress) refuse('STUDIO_COLLECTOR_EGRESS_REFUSED');
      const observed = await usage.read({ signal: attempt.signal });
      if (!acceptingEgress) refuse('STUDIO_COLLECTOR_EGRESS_REFUSED');
      const estimatedBytes = estimatedStoredBytes(
        attempt.wireBytes,
        configuration.storedExpansionBasisPoints,
      );
      const providerExposure =
        observed.approximateBytes +
        configuration.usageLagReserveBytes +
        estimatedBytes;
      if (
        !Number.isSafeInteger(providerExposure) ||
        providerExposure > configuration.providerStopBeforeBytes
      )
        refuse('STUDIO_COLLECTOR_EGRESS_REFUSED');
      const reservation = await budget.reserveEstimatedIngest(estimatedBytes);
      return Object.freeze({ ...reservation, ...attempt });
    },
  });

  let connection;
  const subscriptions = [];
  let stopped = false;
  let fatal;
  let wakeResolve;
  const wake = () => {
    wakeResolve?.();
    wakeResolve = undefined;
  };
  const fail = (code) => {
    fatal ??= new ManagedLogCollectorError(code);
    acceptingEgress = false;
    wake();
    void connection?.close().catch(() => undefined);
  };
  const queue = createQueue({
    maximumBytes: maximumQueueBytes,
    maximumRecords: maximumQueueRecords,
    wake,
    fail,
  });
  const abort = () => {
    stopped = true;
    wake();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) return Object.freeze({ outcome: 'stopped' });
    connection = await connect({
      servers: FLY_NATS_SERVER,
      user: configuration.flyOrg,
      pass: configuration.flyToken,
      name: 'network-canvas-managed-log-collector',
      reconnect: true,
      maxReconnectAttempts: 60,
      reconnectTimeWait: 1_000,
      reconnectJitter: 250,
      timeout: 10_000,
      waitOnFirstConnect: false,
      ignoreAuthErrorAbort: false,
    });
    const closed = connection.closed().then(() => {
      if (!stopped) fail('STUDIO_COLLECTOR_NATS_UNAVAILABLE');
      return undefined;
    });
    void closed.catch(() => fail('STUDIO_COLLECTOR_NATS_UNAVAILABLE'));
    void (async () => {
      try {
        for await (const status of connection.status()) {
          if (
            !stopped &&
            (status.type === 'slowConsumer' || status.type === 'error')
          ) {
            fail('STUDIO_COLLECTOR_NATS_UNAVAILABLE');
            return;
          }
        }
      } catch {
        fail('STUDIO_COLLECTOR_NATS_UNAVAILABLE');
      }
    })();
    for (const application of Object.values(configuration.flyApplications)) {
      const subscription = connection.subscribe(`logs.${application}.iad.*`, {
        slow: maximumQueueRecords,
        callback: (error, message) => {
          if (error || !message) {
            fail('STUDIO_COLLECTOR_NATS_UNAVAILABLE');
            return;
          }
          queue.push({
            payload: new Uint8Array(message.data),
            provenance: {
              transport: AUTHENTICATED_FLY_NATS_TRANSPORT,
              subject: message.subject,
            },
          });
        },
      });
      subscriptions.push(subscription);
      void subscription.closed.then(() => {
        if (!stopped) fail('STUDIO_COLLECTOR_NATS_UNAVAILABLE');
        return undefined;
      });
    }
    for (;;) {
      if (fatal || (stopped && queue.length === 0)) break;
      if (queue.length === 0) {
        await new Promise((resolve) => {
          wakeResolve = resolve;
        });
        continue;
      }
      const result = await logs.send(queue.shiftBatch());
      if (result.outcome !== 'accepted' && result.outcome !== 'dropped')
        fail('STUDIO_COLLECTOR_EGRESS_REFUSED');
    }
    if (fatal) throw fatal;
    for (const subscription of subscriptions) subscription.unsubscribe();
    await connection.drain();
    return Object.freeze({ outcome: 'stopped' });
  } catch (error) {
    if (fatal) throw fatal;
    if (error instanceof ManagedLogCollectorError) throw error;
    return refuse(
      connection
        ? 'STUDIO_COLLECTOR_EGRESS_REFUSED'
        : 'STUDIO_COLLECTOR_NATS_UNAVAILABLE',
    );
  } finally {
    signal?.removeEventListener('abort', abort);
    for (const subscription of subscriptions) {
      try {
        subscription.unsubscribe();
      } catch {
        // Preserve the original collector result.
      }
    }
    try {
      await connection?.close();
    } catch {
      // Preserve the original collector result.
    }
    await budget.close();
  }
}

async function main() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runManagedLogCollector(
      managedLogCollectorConfigurationFromEnvironment(process.env),
      { signal: controller.signal },
    );
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(
      `${
        error instanceof ManagedLogCollectorError
          ? error.code
          : 'STUDIO_COLLECTOR_EGRESS_REFUSED'
      }\n`,
    );
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
