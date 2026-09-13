import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { afterEach } from 'node:test';

import { connect as connectNats } from '@nats-io/transport-node';

import { bootstrapMonthlyEgressBudget } from '../../apps/studio/deployment/managed/observability-egress-budget.mjs';
import {
  managedLogCollectorBudgetOptions,
  managedLogCollectorConfigurationFromEnvironment,
  runManagedLogCollector,
} from './studio-managed-log-collector.mjs';

const observedAt = Date.parse('2026-09-13T12:34:57.000Z');
const canary = 'private-team-SecretToken';
const flyReadOnlyToken = `FlyV1 fm2_${'A'.repeat(100)}`;
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function environment(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-log-collector-'));
  temporaryDirectories.push(directory);
  return {
    FLY_ORG: 'network-canvas',
    FLY_NATS_TOKEN: flyReadOnlyToken,
    STUDIO_FLY_PRODUCTION_APP: 'nc-studio-production',
    STUDIO_FLY_STAGING_APP: 'nc-studio-staging',
    REGISTRY_FLY_PRODUCTION_APP: 'nc-registry-production',
    REGISTRY_FLY_STAGING_APP: 'nc-registry-staging',
    NEW_RELIC_ACCOUNT_ID: '1234567',
    NEW_RELIC_LICENSE_KEY: 'synthetic-license-key'.repeat(3),
    NEW_RELIC_USER_KEY: 'synthetic-user-key'.repeat(3),
    OBSERVABILITY_ANCHOR_URL: 'https://anchor.invalid',
    OBSERVABILITY_ANCHOR_FORWARDER_TOKEN: 'synthetic-anchor-token'.repeat(3),
    STUDIO_OBSERVABILITY_BUDGET_DIRECTORY: join(directory, 'budget'),
    STUDIO_OBSERVABILITY_MONTHLY_LIMIT_BYTES: '1000000',
    STUDIO_OBSERVABILITY_FINAL_SIGNAL_RESERVE_BYTES: '1000',
    STUDIO_NEW_RELIC_STOP_BEFORE_BYTES: '90000000000',
    STUDIO_NEW_RELIC_USAGE_LAG_RESERVE_BYTES: '1000000',
    STUDIO_NEW_RELIC_STORED_EXPANSION_BPS: '20000',
    STUDIO_NEW_RELIC_EXPANSION_EVIDENCE_SHA256: 'e'.repeat(64),
    ...overrides,
  };
}

function createLockLauncher(configuration) {
  const root = join(configuration.budgetDirectory, '..');
  const bin = join(root, 'bin');
  mkdirSync(bin, { mode: 0o700 });
  const fallback = join(bin, 'flock');
  writeFileSync(
    fallback,
    `#!/usr/bin/perl
use strict;
use warnings;
use Fcntl qw(LOCK_EX LOCK_NB);
open(my $lock, '+<&=3') or exit 73;
flock($lock, LOCK_EX | LOCK_NB) or exit 75;
exit 0;
`,
    { mode: 0o700 },
  );
  chmodSync(fallback, 0o700);
  return (_program, argumentsValue, options) =>
    spawnSync(
      process.platform === 'linux' ? 'flock' : fallback,
      argumentsValue,
      options,
    );
}

function createMemoryAnchor() {
  let checkpoint;
  return {
    async initialize(next) {
      assert.equal(checkpoint, undefined);
      checkpoint = structuredClone(next);
    },
    async read() {
      assert.ok(checkpoint);
      return structuredClone(checkpoint);
    },
    async advance(previous, next) {
      assert.deepEqual(previous, checkpoint);
      checkpoint = structuredClone(next);
    },
    fetch: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://anchor.invalid');
      assert.match(options.headers.authorization, /^Bearer /);
      const request = JSON.parse(options.body);
      const path = new URL(url).pathname;
      if (path === '/v1/read') assert.deepEqual(request, { format: 1 });
      else if (path === '/v1/advance') {
        assert.deepEqual(request.previous, checkpoint);
        checkpoint = structuredClone(request.next);
      } else throw new Error('unexpected anchor operation');
      const body = JSON.stringify({ format: 1, checkpoint });
      return new Response(body, {
        status: 200,
        headers: {
          'cache-control': 'no-store',
          'content-length': String(Buffer.byteLength(body)),
          'content-type': 'application/json',
        },
      });
    },
  };
}

function createNatsFixture() {
  const subscriptions = new Map();
  let closeConnection;
  const closed = new Promise((resolve) => {
    closeConnection = resolve;
  });
  let connectionClosed = false;
  const connection = {
    closed: () => closed,
    close: async () => {
      if (connectionClosed) return;
      connectionClosed = true;
      for (const subscription of subscriptions.values())
        subscription.closeSubscription();
      closeConnection();
    },
    drain: async () => connection.close(),
    status: async function* () {
      await closed;
      yield* [];
    },
    subscribe(subject, options) {
      let closeSubscription;
      const subscriptionClosed = new Promise((resolve) => {
        closeSubscription = resolve;
      });
      /**
       * @type {Pick<import('@nats-io/transport-node').Subscription,
       *   'closed' | 'unsubscribe'> & {
       *     callback: import('@nats-io/transport-node').MsgCallback<
       *       import('@nats-io/transport-node').Msg
       *     >;
       *     closeSubscription: () => void;
       *   }}
       */
      const subscription = {
        closed: subscriptionClosed,
        closeSubscription,
        unsubscribe: () => {
          closeSubscription();
        },
        callback: options.callback,
      };
      subscriptions.set(subject, subscription);
      return subscription;
    },
  };
  return {
    connection,
    connectOptions: undefined,
    connect: async function (options) {
      this.connectOptions = options;
      return connection;
    },
    emit(subject, data) {
      const application = subject.split('.')[1];
      const subscription = subscriptions.get(`logs.${application}.iad.*`);
      assert.ok(subscription, `missing subscription for ${application}`);
      subscription.callback(null, { subject, data });
    },
    get subscriptionCount() {
      return subscriptions.size;
    },
  };
}

async function createNatsProtocolFixture() {
  const sockets = new Set();
  const subscriptions = new Map();
  const waiters = new Set();
  let unsubscribeCount = 0;
  const notify = () => {
    for (const check of waiters) check();
  };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
      notify();
    });
    socket.write(
      'INFO {"server_id":"collector-test","server_name":"collector-test",' +
        '"version":"2.11.8","proto":1,"host":"127.0.0.1",' +
        '"port":4222,"max_payload":1048576}\r\n',
    );
    let pending = '';
    socket.on('data', (bytes) => {
      pending += bytes.toString();
      for (;;) {
        const boundary = pending.indexOf('\r\n');
        if (boundary === -1) break;
        const command = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        if (command === 'PING') socket.write('PONG\r\n');
        else if (command.startsWith('SUB ')) {
          const tokens = command.split(' ');
          subscriptions.set(tokens[1], {
            sid: tokens.at(-1),
            socket,
          });
          notify();
        } else if (command.startsWith('UNSUB ')) {
          unsubscribeCount += 1;
          notify();
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const waitUntil = (predicate) => {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!predicate()) return;
        clearTimeout(timeout);
        waiters.delete(check);
        resolve();
      };
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error('NATS protocol fixture condition was not reached'));
      }, 3_000);
      waiters.add(check);
    });
  };
  return {
    url: `nats://127.0.0.1:${address.port}`,
    async waitForSubscriptions(count) {
      await waitUntil(() => subscriptions.size === count);
    },
    publish(subject, data) {
      const match = [...subscriptions.entries()].find(([pattern]) => {
        const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
        return pattern.endsWith('*')
          ? subject.startsWith(prefix)
          : subject === pattern;
      });
      assert.ok(match, `missing real subscription for ${subject}`);
      const [, subscription] = match;
      subscription.socket.write(
        Buffer.concat([
          Buffer.from(
            `MSG ${subject} ${subscription.sid} ${data.byteLength}\r\n`,
          ),
          data,
          Buffer.from('\r\n'),
        ]),
      );
    },
    denySubscription(subject) {
      const subscription = subscriptions.get(subject);
      assert.ok(subscription, `missing real subscription for ${subject}`);
      subscription.socket.write(
        `-ERR 'Permissions Violation for Subscription to "${subject}"'\r\n`,
      );
    },
    async waitForDisconnect() {
      await waitUntil(() => sockets.size === 0);
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function flyLog(message) {
  const machine = '18574832b905e8';
  return {
    subject: `logs.nc-studio-production.iad.${machine}`,
    payload: Buffer.from(
      JSON.stringify({
        event: { provider: 'app' },
        fly: {
          app: { instance: machine, name: 'nc-studio-production' },
          region: 'iad',
        },
        host: machine,
        log: { level: 'info' },
        message: JSON.stringify(message),
        timestamp: '2026-09-13T12:34:57.123456789Z',
      }),
    ),
  };
}

function usageResponse(approximateBytes = 0) {
  const body = JSON.stringify({
    data: {
      actor: {
        account: {
          id: 1234567,
          nrql: {
            results: [
              {
                gigabytes: approximateBytes / 1_000_000_000,
                reportedAt: Math.floor(observedAt / 1000),
                monthStart: Date.UTC(2026, 8, 1) / 1000,
              },
            ],
          },
        },
      },
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-length': String(Buffer.byteLength(body)),
      'content-type': 'application/json',
    },
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('condition was not reached');
}

async function fixture(
  environmentOverrides = {},
  fetchNewRelic,
  runtimeOverrides = {},
) {
  const configuration = managedLogCollectorConfigurationFromEnvironment(
    environment(environmentOverrides),
  );
  const launch = createLockLauncher(configuration);
  const anchor = createMemoryAnchor();
  await bootstrapMonthlyEgressBudget(
    managedLogCollectorBudgetOptions(configuration),
    { operatorAnchor: anchor, now: () => new Date(observedAt), launch },
  );
  const nats = createNatsFixture();
  const abort = new AbortController();
  const run = runManagedLogCollector(configuration, {
    connect: nats.connect.bind(nats),
    fetchAnchor: anchor.fetch,
    fetchNewRelic,
    launch,
    now: () => observedAt,
    signal: abort.signal,
    ...runtimeOverrides,
  });
  await waitFor(() => nats.subscriptionCount === 4);
  return { abort, configuration, nats, run };
}

async function realNatsFixture(fetchNewRelic) {
  const nats = await createNatsProtocolFixture();
  const configuration =
    managedLogCollectorConfigurationFromEnvironment(environment());
  const launch = createLockLauncher(configuration);
  const anchor = createMemoryAnchor();
  await bootstrapMonthlyEgressBudget(
    managedLogCollectorBudgetOptions(configuration),
    { operatorAnchor: anchor, now: () => new Date(observedAt), launch },
  );
  const subscriptions = [];
  const abort = new AbortController();
  const run = runManagedLogCollector(configuration, {
    connect: async (options) => {
      const connection = await connectNats({
        ...options,
        servers: nats.url,
        reconnect: false,
        timeout: 1_000,
      });
      const subscribe = connection.subscribe.bind(connection);
      connection.subscribe = (subject, subscriptionOptions) => {
        const subscription = subscribe(subject, subscriptionOptions);
        subscriptions.push(subscription);
        return subscription;
      };
      return connection;
    },
    fetchAnchor: anchor.fetch,
    fetchNewRelic,
    launch,
    now: () => observedAt,
    signal: abort.signal,
  });
  try {
    await Promise.race([
      nats.waitForSubscriptions(4),
      run.then(
        () => {
          throw new Error('collector stopped before subscribing');
        },
        (error) => {
          throw error;
        },
      ),
    ]);
    return { abort, configuration, nats, run, subscriptions };
  } catch (error) {
    abort.abort();
    await run.catch(() => undefined);
    await nats.close();
    throw error;
  }
}

test(
  'the pinned NATS transport subscribes, ingests, and closes through its public lifecycle',
  { timeout: 10_000 },
  async () => {
    const logRequests = [];
    const f = await realNatsFixture(async (url, options) => {
      if (url === 'https://api.newrelic.com/graphql') return usageResponse();
      logRequests.push({ url, options });
      return new Response(null, { status: 202 });
    });
    try {
      assert.equal(f.subscriptions.length, 4);
      for (const subscription of f.subscriptions) {
        assert.equal(typeof subscription.closed.then, 'function');
        assert.equal(subscription.isClosed(), false);
      }
      const source = flyLog({
        level: 30,
        time: '2026-09-13T12:34:56.789Z',
        event: 'http_request',
        request_id: '123e4567-e89b-42d3-a456-426614174000',
        route: '/healthz',
        method: 'GET',
        status: 200,
        duration_ms: 1.25,
        team_id: canary,
      });
      f.nats.publish(source.subject, source.payload);
      await waitFor(() => logRequests.length === 1);
      assert.ok(!logRequests[0].options.body.includes(canary));
      f.abort.abort();
      assert.deepEqual(await f.run, { outcome: 'stopped' });
      assert.equal(f.nats.unsubscribeCount, 4);
      await f.nats.waitForDisconnect();
      for (const subscription of f.subscriptions)
        assert.equal(subscription.isClosed(), true);
    } finally {
      f.abort.abort();
      await f.run.catch(() => undefined);
      await f.nats.close();
    }
  },
);

test(
  'an unexpected real NATS subscription rejection fails without provider egress',
  { timeout: 10_000 },
  async () => {
    let providerRequests = 0;
    const f = await realNatsFixture(async () => {
      providerRequests += 1;
      return usageResponse();
    });
    try {
      f.nats.denySubscription('logs.nc-studio-production.iad.*');
      await assert.rejects(f.run, /STUDIO_COLLECTOR_NATS_UNAVAILABLE/);
      assert.equal(providerRequests, 0);
      await f.nats.waitForDisconnect();
    } finally {
      f.abort.abort();
      await f.run.catch(() => undefined);
      await f.nats.close();
    }
  },
);

test('subscribes with Fly credentials and forwards only the sanitized composition', async () => {
  const logRequests = [];
  const f = await fixture({}, async (url, options) => {
    if (url === 'https://api.newrelic.com/graphql') return usageResponse();
    logRequests.push({ url, options });
    return new Response(null, { status: 202 });
  });
  assert.deepEqual(f.nats.connectOptions, {
    servers: 'nats://[fdaa::3]:4223',
    user: 'network-canvas',
    pass: flyReadOnlyToken,
    name: 'network-canvas-managed-log-collector',
    reconnect: true,
    maxReconnectAttempts: 60,
    reconnectTimeWait: 1_000,
    reconnectJitter: 250,
    timeout: 10_000,
    waitOnFirstConnect: false,
    ignoreAuthErrorAbort: false,
  });
  const source = flyLog({
    level: 30,
    time: '2026-09-13T12:34:56.789Z',
    event: 'http_request',
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    route: '/healthz',
    method: 'GET',
    status: 200,
    duration_ms: 1.25,
    team_id: canary,
  });
  f.nats.emit(source.subject, source.payload);
  await waitFor(() => logRequests.length === 1);
  const request = logRequests[0];
  assert.equal(request.url, 'https://log-api.newrelic.com/log/v1');
  assert.ok(!request.options.body.includes(canary));
  assert.ok(!request.options.body.includes(f.configuration.flyToken));
  assert.ok(!request.options.body.includes(f.configuration.licenseKey));
  const sent = JSON.parse(request.options.body);
  assert.equal(sent[0].logs[0].attributes.route, '/healthz');
  assert.equal(sent[0].logs[0].attributes.team_id, undefined);
  f.abort.abort();
  assert.deepEqual(await f.run, { outcome: 'stopped' });
});

test('durable budget exhaustion refuses egress before the provider request', async () => {
  let logRequests = 0;
  const f = await fixture(
    {
      STUDIO_OBSERVABILITY_MONTHLY_LIMIT_BYTES: '600',
      STUDIO_OBSERVABILITY_FINAL_SIGNAL_RESERVE_BYTES: '100',
    },
    async (url) => {
      if (url === 'https://api.newrelic.com/graphql') return usageResponse();
      logRequests += 1;
      return new Response(null, { status: 400 });
    },
  );
  const source = flyLog({
    level: 30,
    time: '2026-09-13T12:34:56.789Z',
    event: 'http_request',
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    route: '/healthz',
    method: 'GET',
    status: 200,
    duration_ms: 1.25,
  });
  f.nats.emit(source.subject, source.payload);
  await assert.rejects(f.run, /STUDIO_COLLECTOR_EGRESS_REFUSED/);
  assert.equal(logRequests, 0);
});

test('fresh provider usage still refuses egress at the configured pre-limit stop', async () => {
  let logRequests = 0;
  const f = await fixture(
    {
      STUDIO_NEW_RELIC_STOP_BEFORE_BYTES: '2000000',
      STUDIO_NEW_RELIC_USAGE_LAG_RESERVE_BYTES: '1000000',
    },
    async (url) => {
      if (url === 'https://api.newrelic.com/graphql')
        return usageResponse(1_500_000);
      logRequests += 1;
      return new Response(null, { status: 400 });
    },
  );
  const source = flyLog({
    level: 30,
    time: '2026-09-13T12:34:56.789Z',
    event: 'http_request',
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    route: '/healthz',
    method: 'GET',
    status: 200,
    duration_ms: 1.25,
  });
  f.nats.emit(source.subject, source.payload);
  await assert.rejects(f.run, /STUDIO_COLLECTOR_EGRESS_REFUSED/);
  assert.equal(logRequests, 0);
});

test('bounded queue overflow closes the subscription instead of dropping privately', async () => {
  let releaseUsage;
  const waitingUsage = new Promise((resolve) => {
    releaseUsage = resolve;
  });
  let logRequests = 0;
  const f = await fixture(
    {},
    async (url) => {
      if (url === 'https://api.newrelic.com/graphql') return waitingUsage;
      logRequests += 1;
      return new Response(null, { status: 202 });
    },
    { maximumQueueRecords: 1 },
  );
  const source = flyLog({
    level: 30,
    time: '2026-09-13T12:34:56.789Z',
    event: 'http_request',
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    route: '/healthz',
    method: 'GET',
    status: 200,
    duration_ms: 1.25,
  });
  f.nats.emit(source.subject, source.payload);
  await new Promise((resolve) => setImmediate(resolve));
  f.nats.emit(source.subject, source.payload);
  f.nats.emit(source.subject, source.payload);
  releaseUsage(usageResponse());
  await assert.rejects(f.run, /STUDIO_COLLECTOR_QUEUE_EXHAUSTED/);
  assert.equal(logRequests, 0);
});

test('shutdown refuses late intake while draining an admitted request', async () => {
  let releaseUsage;
  const waitingUsage = new Promise((resolve) => {
    releaseUsage = resolve;
  });
  let usageRequests = 0;
  let logRequests = 0;
  const f = await fixture({}, async (url) => {
    if (url === 'https://api.newrelic.com/graphql') {
      usageRequests += 1;
      return waitingUsage;
    }
    logRequests += 1;
    return new Response(null, { status: 202 });
  });
  const source = flyLog({
    level: 30,
    time: '2026-09-13T12:34:56.789Z',
    event: 'http_request',
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    route: '/healthz',
    method: 'GET',
    status: 200,
    duration_ms: 1.25,
  });
  f.nats.emit(source.subject, source.payload);
  await waitFor(() => usageRequests === 1);
  f.abort.abort();
  f.nats.emit(source.subject, source.payload);
  releaseUsage(usageResponse());
  assert.deepEqual(await f.run, { outcome: 'stopped' });
  assert.equal(usageRequests, 1);
  assert.equal(logRequests, 1);
});

test('environment contract rejects an unmeasured or free-limit configuration', () => {
  for (const changes of [
    { STUDIO_NEW_RELIC_STORED_EXPANSION_BPS: '9999' },
    { STUDIO_NEW_RELIC_STOP_BEFORE_BYTES: '100000000000' },
    { STUDIO_NEW_RELIC_EXPANSION_EVIDENCE_SHA256: 'unreviewed' },
  ]) {
    assert.throws(
      () =>
        managedLogCollectorConfigurationFromEnvironment(environment(changes)),
      /STUDIO_COLLECTOR_CONFIGURATION_INVALID/,
    );
  }
});

test('environment contract accepts the non-plain process environment shape', () => {
  const source = environment();
  const inherited = Object.create({ PATH: '/ignored' });
  Object.assign(inherited, source);
  assert.equal(
    managedLogCollectorConfigurationFromEnvironment(inherited).accountId,
    1234567,
  );
});

test('environment contract preserves the documented Fly read-only token', () => {
  const configuration = managedLogCollectorConfigurationFromEnvironment(
    environment({ FLY_NATS_TOKEN: flyReadOnlyToken }),
  );
  assert.equal(configuration.flyToken, flyReadOnlyToken);
});

test('environment contract rejects line terminators appended to credentials', () => {
  for (const changes of [
    { FLY_NATS_TOKEN: `${flyReadOnlyToken}\n` },
    { FLY_NATS_TOKEN: `${flyReadOnlyToken}\r` },
    { NEW_RELIC_LICENSE_KEY: `${'license-key'.repeat(4)}\n` },
    { NEW_RELIC_USER_KEY: `${'user-key'.repeat(5)}\r` },
    {
      OBSERVABILITY_ANCHOR_FORWARDER_TOKEN: `${'anchor-token'.repeat(4)}\n`,
    },
  ]) {
    assert.throws(
      () =>
        managedLogCollectorConfigurationFromEnvironment(environment(changes)),
      /STUDIO_COLLECTOR_CONFIGURATION_INVALID/,
    );
  }
});

test('direct runtime configuration rejects appended credential bytes', async () => {
  const configuration =
    managedLogCollectorConfigurationFromEnvironment(environment());
  for (const changes of [
    { flyToken: `${configuration.flyToken}\n` },
    { licenseKey: `${configuration.licenseKey}\r` },
    { userKey: `${configuration.userKey}\n` },
    { anchorToken: `${configuration.anchorToken}\r` },
  ]) {
    await assert.rejects(
      runManagedLogCollector({ ...configuration, ...changes }),
      /STUDIO_COLLECTOR_CONFIGURATION_INVALID/,
    );
  }
});

test('budget binding changes with measured expansion evidence', () => {
  const left = managedLogCollectorBudgetOptions(
    managedLogCollectorConfigurationFromEnvironment(environment()),
  );
  const right = managedLogCollectorBudgetOptions(
    managedLogCollectorConfigurationFromEnvironment(
      environment({
        STUDIO_NEW_RELIC_EXPANSION_EVIDENCE_SHA256: 'f'.repeat(64),
      }),
    ),
  );
  assert.notEqual(left.configurationIdentity, right.configurationIdentity);
  assert.match(left.configurationIdentity, /^[a-f0-9]{64}$/);
  assert.equal(
    createHash('sha256').update(left.accountIdentity).digest('hex').length,
    64,
  );
});
