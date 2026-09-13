import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { canonicalize } from '../../../../packages/studio-sync/src/apply.ts';
import {
  createManagedAnchorLambda,
  handler,
} from './observability-anchor-lambda.mjs';
import {
  rawEd25519PublicKey,
  signMonthAuthorization,
} from './observability-month-authorization.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const account = sha('fixed-account');

function checkpoint(overrides = {}) {
  const value = {
    accountIdentitySha256: account,
    bindingSha256: sha('policy'),
    exhausted: false,
    finalSignalAttemptedBytes: 0,
    finalSignalReserveBytes: 100,
    format: 2,
    lastObservedAt: '2026-09-13T00:00:00.000Z',
    monthSequence: 1,
    monthUtc: '2026-09',
    payloadAttemptedBytes: 0,
    payloadLimitBytes: 900,
    reservationSequence: 0,
    ...overrides,
  };
  value.stateSha256 = sha(
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
  );
  return value;
}

function fixture(now = () => Date.parse('2026-09-13T12:05:00.000Z')) {
  const key = generateKeyPairSync('ed25519').privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  });
  let current = checkpoint();
  const env = {
    AWS_REGION: 'us-east-1',
    STUDIO_ANCHOR_ACCOUNT_IDENTITY_SHA256: account,
    STUDIO_ANCHOR_TABLE_NAME: 'studio-anchor-test',
    STUDIO_ANCHOR_FORWARDER_TOKEN: 'f'.repeat(43),
    STUDIO_ANCHOR_OPERATOR_TOKEN: 'o'.repeat(43),
    STUDIO_ANCHOR_MONTH_AUTHORITY_KEY_ID: 'month-authority-1',
    STUDIO_ANCHOR_MONTH_AUTHORITY_PUBLIC_KEY: rawEd25519PublicKey(key),
  };
  const commands = [];
  const lambda = createManagedAnchorLambda({
    env,
    now,
    dynamoClient: {
      async send(command) {
        commands.push(command);
        if (command.constructor.name === 'TransactWriteItemsCommand') {
          const update = command.input.TransactItems[1].Update;
          if (
            update.ExpressionAttributeValues[':previous'].S !==
            JSON.stringify(current)
          )
            throw Object.assign(new Error('conditional conflict'), {
              name: 'TransactionCanceledException',
              CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
            });
          current = JSON.parse(update.ExpressionAttributeValues[':next'].S);
          return {};
        }
        return {
          Responses: [
            {
              Item: { initialized: { BOOL: true }, lineageFormat: { N: '1' } },
            },
            { Item: { checkpoint: { S: JSON.stringify(current) } } },
          ],
        };
      },
    },
  });
  const event = (overrides = {}) => ({
    version: '2.0',
    rawPath: '/v1/read',
    rawQueryString: '',
    headers: {
      'authorization': `Bearer ${env.STUDIO_ANCHOR_FORWARDER_TOKEN}`,
      'content-type': 'application/json',
    },
    requestContext: { http: { method: 'POST', path: '/v1/read' } },
    body: '{"format":1}',
    isBase64Encoded: false,
    ...overrides,
  });
  return { commands, env, event, key, lambda };
}

test('adapts one bounded HTTP API v2 request to the fixed account handler', async () => {
  const f = fixture();
  const result = await f.lambda(f.event());
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(
    JSON.parse(result.body).checkpoint.accountIdentitySha256,
    account,
  );
  const encoded = await f.lambda(
    f.event({
      body: Buffer.from('{"format":1}').toString('base64'),
      isBase64Encoded: true,
    }),
  );
  assert.equal(encoded.statusCode, 200);
  assert.equal(f.commands.length, 2);
});

void test('ordinary advances stop at trusted UTC rollover until the signed transition', async () => {
  let clock = Date.parse('2026-09-30T23:59:59.999Z');
  const f = fixture(() => clock);
  const previous = checkpoint();
  const next = checkpoint({
    payloadAttemptedBytes: 20,
    reservationSequence: 1,
  });
  const request = (before, after) =>
    f.event({
      rawPath: '/v1/advance',
      requestContext: { http: { method: 'POST', path: '/v1/advance' } },
      body: JSON.stringify({ format: 1, previous: before, next: after }),
    });
  assert.equal((await f.lambda(request(previous, next))).statusCode, 200);
  const writes = f.commands.filter(
    (command) => command.constructor.name === 'TransactWriteItemsCommand',
  ).length;
  clock = Date.parse('2026-10-01T00:00:00.000Z');
  const refused = await f.lambda(
    request(
      next,
      checkpoint({ payloadAttemptedBytes: 40, reservationSequence: 2 }),
    ),
  );
  assert.equal(refused.statusCode, 400);
  assert.equal(
    f.commands.filter(
      (command) => command.constructor.name === 'TransactWriteItemsCommand',
    ).length,
    writes,
  );
  assert.equal(
    JSON.parse((await f.lambda(f.event())).body).checkpoint
      .payloadAttemptedBytes,
    20,
  );
});

test('advances a month only with the separately signed exact transition', async () => {
  let clock = Date.parse('2026-09-30T23:59:59.999Z');
  const f = fixture(() => clock);
  const previous = checkpoint();
  const next = checkpoint({
    lastObservedAt: '2026-10-01T00:00:00.000Z',
    monthSequence: 2,
    monthUtc: '2026-10',
  });
  const receipt = signMonthAuthorization({
    approval: {
      accountIdentitySha256: account,
      previousStateSha256: previous.stateSha256,
      nextStateSha256: next.stateSha256,
      targetMonthUtc: next.monthUtc,
      issuedAt: '2026-09-30T23:55:00.000Z',
      expiresAt: '2026-10-01T00:05:00.000Z',
    },
    authorityKeyId: 'month-authority-1',
    key: f.key,
    now: Date.parse('2026-09-30T23:55:00.000Z'),
  });
  const body = JSON.stringify({
    authorization: canonicalize(receipt),
    format: 1,
    next,
    previous,
  });
  const early = await f.lambda(
    f.event({
      rawPath: '/v1/advance-month',
      requestContext: { http: { method: 'POST', path: '/v1/advance-month' } },
      headers: {
        'authorization': `Bearer ${f.env.STUDIO_ANCHOR_OPERATOR_TOKEN}`,
        'content-type': 'application/json',
      },
      body,
    }),
  );
  assert.equal(early.statusCode, 400);
  assert.equal(
    f.commands.some(
      (command) => command.constructor.name === 'TransactWriteItemsCommand',
    ),
    false,
  );
  clock = Date.parse('2026-10-01T00:00:00.000Z');
  const accepted = await f.lambda(
    f.event({
      rawPath: '/v1/advance-month',
      requestContext: {
        http: { method: 'POST', path: '/v1/advance-month' },
      },
      headers: {
        'authorization': `Bearer ${f.env.STUDIO_ANCHOR_OPERATOR_TOKEN}`,
        'content-type': 'application/json',
      },
      body,
    }),
  );
  assert.equal(accepted.statusCode, 200);
  const replay = await f.lambda(
    f.event({
      rawPath: '/v1/advance-month',
      requestContext: {
        http: { method: 'POST', path: '/v1/advance-month' },
      },
      headers: {
        'authorization': `Bearer ${f.env.STUDIO_ANCHOR_OPERATOR_TOKEN}`,
        'content-type': 'application/json',
      },
      body,
    }),
  );
  assert.equal(replay.statusCode, 409);
  const advanced = await f.lambda(
    f.event({
      rawPath: '/v1/advance',
      requestContext: { http: { method: 'POST', path: '/v1/advance' } },
      body: JSON.stringify({
        format: 1,
        previous: next,
        next: checkpoint({
          lastObservedAt: '2026-10-01T00:00:00.000Z',
          monthSequence: 2,
          monthUtc: '2026-10',
          payloadAttemptedBytes: 20,
          reservationSequence: 1,
        }),
      }),
    }),
  );
  assert.equal(advanced.statusCode, 200);
});

test('rejects malformed transport, oversized bodies, and duplicate authorization before DynamoDB', async () => {
  const f = fixture();
  const cases = [
    f.event({ version: '1.0' }),
    f.event({ rawPath: '/v1/read/extra' }),
    f.event({ rawQueryString: 'x=1' }),
    f.event({ requestContext: { http: { method: 'GET', path: '/v1/read' } } }),
    f.event({ body: 'x'.repeat(16_385) }),
    f.event({
      headers: {
        'Authorization': 'Bearer a',
        'authorization': 'Bearer b',
        'content-type': 'application/json',
      },
    }),
    f.event({
      headers: {
        'authorization': 'Bearer a,Bearer b',
        'content-type': 'application/json',
      },
    }),
    f.event({ body: '%%%=', isBase64Encoded: true }),
  ];
  for (const event of cases) {
    const result = await f.lambda(event);
    assert.equal(result.statusCode, 400);
    assert.deepEqual(JSON.parse(result.body), { code: 'ANCHOR_INPUT_INVALID' });
  }
  assert.equal(f.commands.length, 0);
});

test('configuration failures expose only a fixed safe error', async () => {
  const f = fixture();
  assert.throws(
    () =>
      createManagedAnchorLambda({
        env: {
          ...f.env,
          STUDIO_ANCHOR_FORWARDER_TOKEN: 'private-token-canary',
        },
      }),
    { message: 'ANCHOR_RUNTIME_CONFIGURATION_INVALID' },
  );
  const result = await handler(fixture().event());
  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), {
    code: 'ANCHOR_INTERNAL_FAILURE',
  });
  assert.equal(result.body.includes('STUDIO_ANCHOR'), false);
});

test('constructs the production DynamoDB client with ambient endpoints disabled', () => {
  const f = fixture();
  let options;
  class FakeDynamoDBClient {
    constructor(value) {
      options = value;
    }
    async send() {
      throw new Error('unused');
    }
  }
  createManagedAnchorLambda({
    env: f.env,
    DynamoDBClientClass: FakeDynamoDBClient,
  });
  assert.deepEqual(options, {
    region: 'us-east-1',
    ignoreConfiguredEndpointUrls: true,
  });
});
