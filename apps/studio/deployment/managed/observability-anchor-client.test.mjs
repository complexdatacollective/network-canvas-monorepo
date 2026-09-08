import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

import {
  ObservabilityAnchorClientError,
  createObservabilityAnchorClient,
} from './observability-anchor-client.mjs';
import { createDynamoAnchorStore } from './observability-dynamodb-anchor-store.mjs';
import { createEgressBudgetOperations } from './observability-egress-budget.mjs';
import {
  createMonotonicAnchorHandler,
  fixedBearerAuthenticator,
} from './observability-monotonic-anchor.mjs';

const account = 'a'.repeat(64);
const forwarder = 'f'.repeat(64);
const operator = 'o'.repeat(64);

const stateDigest = (value) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        bindingSha256: value.bindingSha256,
        exhausted: value.exhausted,
        finalSignalAttemptedBytes: value.finalSignalAttemptedBytes,
        format: 1,
        lastObservedAt: value.lastObservedAt,
        monthSequence: value.monthSequence,
        monthUtc: value.monthUtc,
        payloadAttemptedBytes: value.payloadAttemptedBytes,
        reservationSequence: value.reservationSequence,
      }),
    )
    .digest('hex');

function checkpoint(overrides = {}) {
  const value = {
    accountIdentitySha256: account,
    bindingSha256: 'b'.repeat(64),
    exhausted: false,
    finalSignalAttemptedBytes: 0,
    finalSignalReserveBytes: 100,
    format: 2,
    lastObservedAt: '2026-09-08T12:00:00.000Z',
    monthSequence: 1,
    monthUtc: '2026-09',
    payloadAttemptedBytes: 0,
    payloadLimitBytes: 900,
    reservationSequence: 0,
    stateSha256: '',
    ...overrides,
  };
  value.stateSha256 = stateDigest(value);
  return value;
}

function memoryHandler() {
  let current;
  const store = {
    async compareAndSet(previous, next) {
      if (JSON.stringify(current) !== JSON.stringify(previous)) return false;
      current = structuredClone(next);
      return true;
    },
    async initialize(next) {
      if (current) return false;
      current = structuredClone(next);
      return true;
    },
    async read() {
      return current && structuredClone(current);
    },
  };
  return createMonotonicAnchorHandler({
    accountIdentitySha256: account,
    authenticate: fixedBearerAuthenticator({
      accountIdentitySha256: account,
      forwarderToken: forwarder,
      operatorToken: operator,
    }),
    authorizeMonth: async ({ authorization }) => authorization === 'approved',
    store,
  });
}

const requestAdapter =
  (handler, inspect = () => undefined) =>
  async (url, init) => {
    inspect(url, init);
    return handler(new Request(url, init));
  };

const client = (authority, token, fetch) =>
  createObservabilityAnchorClient({
    accountIdentitySha256: account,
    authority,
    endpoint: 'https://anchor.invalid',
    fetch,
    token,
  });

function trackedResponse(options) {
  let cancellations = 0;
  return {
    cancellations: () => cancellations,
    response: new Response(
      new ReadableStream({
        cancel() {
          cancellations += 1;
        },
      }),
      options,
    ),
  };
}

test('operator and forwarder clients use exact bounded routes and checkpoints', async () => {
  const requests = [];
  const handler = memoryHandler();
  const transport = requestAdapter(handler, (url, init) => {
    requests.push({ init, url });
  });
  const operatorClient = client('operator', operator, transport);
  const runtimeClient = client('forwarder', forwarder, transport);
  const initial = checkpoint();
  await operatorClient.initialize(initial);
  assert.deepEqual(await runtimeClient.read(account), initial);
  const next = checkpoint({
    payloadAttemptedBytes: 100,
    reservationSequence: 1,
  });
  await runtimeClient.advance(initial, next);
  assert.deepEqual(await operatorClient.read(), next);
  assert.deepEqual(
    requests.map(({ url }) => new URL(url).pathname),
    ['/v1/initialize', '/v1/read', '/v1/advance', '/v1/read'],
  );
  for (const { init } of requests) {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(Number(init.headers['content-length']), init.body.length);
  }
  assert.equal(JSON.stringify(requests).includes(operator), true);
});

test('roles expose only their required operations and bind the account', async () => {
  const handler = memoryHandler();
  const runtimeClient = client('forwarder', forwarder, requestAdapter(handler));
  const operatorClient = client('operator', operator, requestAdapter(handler));
  assert.deepEqual(Object.keys(runtimeClient).toSorted(), ['advance', 'read']);
  assert.deepEqual(Object.keys(operatorClient).toSorted(), [
    'advanceMonth',
    'initialize',
    'read',
  ]);
  await assert.rejects(
    () => runtimeClient.read('c'.repeat(64)),
    /ANCHOR_CLIENT_INPUT_INVALID/,
  );
});

test('redirects, oversized and malformed responses fail with fixed codes', async (t) => {
  const earlyRefusals = [
    trackedResponse({ status: 302 }),
    trackedResponse({
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain',
      },
    }),
    trackedResponse({ headers: { 'content-type': 'application/json' } }),
    trackedResponse({
      headers: {
        'cache-control': 'no-store',
        'content-length': 'invalid',
        'content-type': 'application/json',
      },
    }),
    trackedResponse({
      headers: {
        'cache-control': 'no-store',
        'content-length': '16385',
        'content-type': 'application/json',
      },
    }),
  ];
  for (const scenario of earlyRefusals) {
    const anchor = client(
      'forwarder',
      forwarder,
      async () => scenario.response,
    );
    await assert.rejects(() => anchor.read(), /ANCHOR_CLIENT_RESPONSE_INVALID/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(scenario.cancellations(), 1);
  }

  const scenarios = [
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.alloc(16_385));
        },
      }),
      {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/json',
        },
      },
    ),
    Response.json(
      { checkpoint: checkpoint(), extra: true, format: 1 },
      {
        headers: { 'cache-control': 'no-store' },
      },
    ),
    new Response(JSON.stringify({ checkpoint: checkpoint(), format: 1 }), {
      headers: {
        'cache-control': 'no-store',
        'content-length': '1',
        'content-type': 'application/json',
      },
    }),
  ];
  for (const response of scenarios) {
    await t.test(`refuses status ${response.status}`, async () => {
      const anchor = client('forwarder', forwarder, async () => response);
      await assert.rejects(
        () => anchor.read(),
        (error) => {
          assert.ok(error instanceof ObservabilityAnchorClientError);
          assert.equal(error.code, 'ANCHOR_CLIENT_RESPONSE_INVALID');
          assert.equal(error.message, error.code);
          return true;
        },
      );
    });
  }
});

test('timeout aborts transport and never includes the token in its error', async () => {
  let aborted = false;
  const anchor = createObservabilityAnchorClient({
    accountIdentitySha256: account,
    authority: 'forwarder',
    endpoint: 'https://anchor.invalid',
    fetch: async (_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error(`lost ${forwarder}`));
          },
          { once: true },
        );
      }),
    operationTimeoutMs: 100,
    token: forwarder,
  });
  await assert.rejects(() => anchor.read(), /ANCHOR_CLIENT_REQUEST_FAILED/);
  assert.equal(aborted, true);
  try {
    await anchor.read();
  } catch (error) {
    assert.equal(String(error).includes(forwarder), false);
  }
});

test('a response arriving after timeout is disposed without changing the refusal', async () => {
  let resolveRequest;
  let cancellations = 0;
  const anchor = createObservabilityAnchorClient({
    accountIdentitySha256: account,
    authority: 'forwarder',
    endpoint: 'https://anchor.invalid',
    fetch: async () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    operationTimeoutMs: 100,
    token: forwarder,
  });
  await assert.rejects(() => anchor.read(), /ANCHOR_CLIENT_REQUEST_FAILED/);
  resolveRequest(
    new Response(
      new ReadableStream({
        cancel() {
          cancellations += 1;
        },
      }),
      {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/json',
        },
      },
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancellations, 1);
});

function localBudgetFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'studio-anchor-client-'));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin, { mode: 0o700 });
  const flock = join(bin, 'flock');
  writeFileSync(
    flock,
    `#!/usr/bin/perl
use Fcntl qw(LOCK_EX LOCK_NB);
open(my $lock, '+<&=3') or exit 73;
flock($lock, LOCK_EX | LOCK_NB) or exit 75;
exit 0;
`,
    { mode: 0o700 },
  );
  return {
    launch: (_program, args, options) =>
      spawnSync(process.platform === 'linux' ? 'flock' : flock, args, options),
    options: {
      accountIdentity: 'synthetic-free-account',
      configurationIdentity: 'c'.repeat(64),
      directory: join(root, 'state'),
      finalSignalReserveBytes: 100,
      monthlyLimitBytes: 1_000,
    },
  };
}

const dynamoEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;

test(
  'local budget reaches a real handler and DynamoDB Local lineage',
  { skip: !dynamoEndpoint },
  async (t) => {
    const url = new URL(dynamoEndpoint);
    assert.equal(url.protocol, 'http:');
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    const dynamo = new DynamoDBClient({
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      endpoint: dynamoEndpoint,
      region: 'local',
    });
    t.after(() => dynamo.destroy());
    const tableName = `studio-budget-${randomUUID()}`;
    await dynamo.send(
      new CreateTableCommand({
        AttributeDefinitions: [
          { AttributeName: 'account', AttributeType: 'S' },
          { AttributeName: 'record', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'account', KeyType: 'HASH' },
          { AttributeName: 'record', KeyType: 'RANGE' },
        ],
        TableName: tableName,
      }),
    );
    t.after(() =>
      dynamo.send(new DeleteTableCommand({ TableName: tableName })),
    );
    const f = localBudgetFixture(t);
    const e2eAccount = createHash('sha256')
      .update(f.options.accountIdentity)
      .digest('hex');
    const store = createDynamoAnchorStore({
      accountIdentitySha256: e2eAccount,
      client: dynamo,
      tableName,
    });
    assert.equal(await store.enroll(), true);
    const handler = createMonotonicAnchorHandler({
      accountIdentitySha256: e2eAccount,
      authenticate: fixedBearerAuthenticator({
        accountIdentitySha256: e2eAccount,
        forwarderToken: forwarder,
        operatorToken: operator,
      }),
      authorizeMonth: async () => true,
      store,
    });
    const transport = requestAdapter(handler);
    const e2eClient = (authority, token) =>
      createObservabilityAnchorClient({
        accountIdentitySha256: e2eAccount,
        authority,
        endpoint: 'https://anchor.invalid',
        fetch: transport,
        token,
      });
    const operations = createEgressBudgetOperations({
      launch: f.launch,
      operatorAnchor: e2eClient('operator', operator),
      runtimeAnchor: e2eClient('forwarder', forwarder),
      now: () => new Date('2026-09-08T12:00:00.000Z'),
    });
    await operations.bootstrap(f.options);
    const budget = await operations.open(f.options);
    await assert.rejects(
      () => budget.reserveFinalExhaustionSignal(10),
      /EGRESS_BUDGET_FINAL_SIGNAL_UNAVAILABLE/,
    );
    const receipt = await budget.reserveEstimatedIngest(123);
    assert.equal(receipt.payloadRemainingBytes, 777);
    assert.equal(receipt.reservationSequence, 1);
    const exhaustion = await budget.reserveEstimatedIngest(777);
    assert.equal(exhaustion.exhausted, true);
    await assert.rejects(
      () => budget.reserveEstimatedIngest(1),
      /EGRESS_BUDGET_EXHAUSTED/,
    );
    const signal = await budget.reserveFinalExhaustionSignal(50);
    assert.equal(signal.kind, 'final-exhaustion-signal');
    assert.equal(signal.reservationSequence, 3);
    await budget.close();
  },
);
