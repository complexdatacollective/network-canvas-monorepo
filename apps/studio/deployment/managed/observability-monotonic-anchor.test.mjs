import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createMonotonicAnchorHandler,
  fixedBearerAuthenticator,
} from './observability-monotonic-anchor.mjs';

const account = createHash('sha256').update('fixed-account').digest('hex');
const forwarder = 'f'.repeat(48);
const operator = 'o'.repeat(48);
const sha = (value) => createHash('sha256').update(value).digest('hex');

function checkpoint(overrides = {}) {
  const state = {
    accountIdentitySha256: account,
    bindingSha256: sha('policy-a'),
    exhausted: false,
    finalSignalAttemptedBytes: 0,
    finalSignalReserveBytes: 100,
    format: 2,
    lastObservedAt: '2026-09-08T00:00:00.000Z',
    monthSequence: 1,
    monthUtc: '2026-09',
    payloadAttemptedBytes: 0,
    payloadLimitBytes: 900,
    reservationSequence: 0,
    ...overrides,
  };
  state.stateSha256 = sha(
    JSON.stringify({
      bindingSha256: state.bindingSha256,
      exhausted: state.exhausted,
      finalSignalAttemptedBytes: state.finalSignalAttemptedBytes,
      format: 1,
      lastObservedAt: state.lastObservedAt,
      monthSequence: state.monthSequence,
      monthUtc: state.monthUtc,
      payloadAttemptedBytes: state.payloadAttemptedBytes,
      reservationSequence: state.reservationSequence,
    }),
  );
  return state;
}

function store() {
  let current = null;
  let initialized = false;
  let failAfterCommit = false;
  return {
    compareAndSet: async (previous, next) => {
      if (JSON.stringify(current) !== JSON.stringify(previous)) return false;
      current = structuredClone(next);
      if (failAfterCommit) throw new Error('private transport failure');
      return true;
    },
    initialize: async (next) => {
      if (initialized) return false;
      initialized = true;
      current = structuredClone(next);
      return true;
    },
    loseRecord: () => {
      current = null;
    },
    read: async () => structuredClone(current),
    setFailAfterCommit: () => {
      failAfterCommit = true;
    },
  };
}

function fixture() {
  const durable = store();
  const authenticate = fixedBearerAuthenticator({
    accountIdentitySha256: account,
    forwarderToken: forwarder,
    operatorToken: operator,
  });
  const handler = createMonotonicAnchorHandler({
    accountIdentitySha256: account,
    authenticate,
    authorizeMonth: async ({ authorization, previous, next }) =>
      authorization ===
      `approved:${previous.stateSha256}:${next.monthUtc}:${next.stateSha256}`,
    store: durable,
  });
  const call = async (path, token, body) => {
    const response = await handler(
      new Request(`https://anchor.invalid${path}`, {
        body: JSON.stringify(body),
        headers: {
          'authorization': `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    );
    return { response, value: await response.json() };
  };
  return { call, durable };
}

test('operator initializes one fixed account lineage and a new directory cannot rebootstrap it', async () => {
  const f = fixture();
  const initial = checkpoint();
  assert.equal(
    (await f.call('/v1/initialize', forwarder, { format: 1, next: initial }))
      .response.status,
    403,
  );
  assert.equal(
    (await f.call('/v1/initialize', operator, { format: 1, next: initial }))
      .response.status,
    200,
  );
  const changedPolicy = checkpoint({ bindingSha256: sha('policy-b') });
  const repeated = await f.call('/v1/initialize', operator, {
    format: 1,
    next: changedPolicy,
  });
  assert.equal(repeated.response.status, 409);
  assert.deepEqual(repeated.value, { code: 'ANCHOR_CONFLICT' });
  f.durable.loseRecord();
  assert.equal(
    (
      await f.call('/v1/initialize', operator, {
        format: 1,
        next: changedPolicy,
      })
    ).response.status,
    409,
  );
});

test('the forwarder advances visible spend counters with exact full-checkpoint CAS', async () => {
  const f = fixture();
  const previous = checkpoint();
  await f.call('/v1/initialize', operator, { format: 1, next: previous });
  const next = checkpoint({
    lastObservedAt: '2026-09-08T00:00:01.000Z',
    payloadAttemptedBytes: 123,
    reservationSequence: 1,
    stateSha256: sha('state-1'),
  });
  assert.equal(
    (
      await f.call('/v1/advance', forwarder, {
        format: 1,
        next,
        previous,
      })
    ).response.status,
    200,
  );
  for (const unsafe of [
    checkpoint({ stateSha256: sha('rollback') }),
    checkpoint({
      bindingSha256: sha('policy-b'),
      payloadAttemptedBytes: 124,
      reservationSequence: 2,
      stateSha256: sha('changed-policy'),
    }),
  ])
    assert.equal(
      (
        await f.call('/v1/advance', forwarder, {
          format: 1,
          next: unsafe,
          previous: next,
        })
      ).response.status,
      400,
    );
});

test('concurrent forks admit exactly one debit', async () => {
  const f = fixture();
  const previous = checkpoint();
  await f.call('/v1/initialize', operator, { format: 1, next: previous });
  const attempts = [1, 2].map((millisecond) =>
    f.call('/v1/advance', forwarder, {
      format: 1,
      next: checkpoint({
        payloadAttemptedBytes: 10,
        reservationSequence: 1,
        lastObservedAt: `2026-09-08T00:00:00.00${millisecond}Z`,
      }),
      previous,
    }),
  );
  assert.deepEqual(
    (await Promise.all(attempts))
      .map(({ response }) => response.status)
      .toSorted((left, right) => left - right),
    [200, 409],
  );
});

test('an error after CAS commit returns no success while retaining the debit', async () => {
  const f = fixture();
  const previous = checkpoint();
  await f.call('/v1/initialize', operator, { format: 1, next: previous });
  const next = checkpoint({
    payloadAttemptedBytes: 20,
    reservationSequence: 1,
    stateSha256: sha('ambiguous'),
  });
  f.durable.setFailAfterCommit();
  const failed = await f.call('/v1/advance', forwarder, {
    format: 1,
    next,
    previous,
  });
  assert.equal(failed.response.status, 503);
  assert.deepEqual(failed.value, { code: 'ANCHOR_INTERNAL_FAILURE' });
  const observed = await f.call('/v1/read', forwarder, { format: 1 });
  assert.equal(observed.value.checkpoint.payloadAttemptedBytes, 20);
});

test('only the operator can authorize the exact next UTC month', async () => {
  const f = fixture();
  const previous = checkpoint();
  await f.call('/v1/initialize', operator, { format: 1, next: previous });
  const next = checkpoint({
    lastObservedAt: '2026-10-01T00:00:00.000Z',
    monthSequence: 2,
    monthUtc: '2026-10',
    stateSha256: sha('october'),
  });
  const body = {
    authorization: `approved:${previous.stateSha256}:${next.monthUtc}:${next.stateSha256}`,
    format: 1,
    next,
    previous,
  };
  assert.equal(
    (await f.call('/v1/advance-month', forwarder, body)).response.status,
    403,
  );
  assert.equal(
    (
      await f.call('/v1/advance-month', operator, {
        ...body,
        authorization: 'invented',
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await f.call('/v1/advance-month', operator, body)).response.status,
    200,
  );
});

test('authentication failures expose fixed codes without credentials', async () => {
  const f = fixture();
  const result = await f.call('/v1/read', 'private-token-canary'.repeat(3), {
    format: 1,
  });
  assert.equal(result.response.status, 401);
  assert.deepEqual(result.value, { code: 'ANCHOR_AUTH_REQUIRED' });
  assert.equal(JSON.stringify(result.value).includes('canary'), false);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
});
