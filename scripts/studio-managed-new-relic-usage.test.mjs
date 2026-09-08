import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { createNewRelicUsageReader } from '../apps/studio/deployment/managed/observability-new-relic-usage.mjs';

const now = Date.parse('2026-09-08T12:30:00.000Z');
const monthStart = Date.parse('2026-09-01T00:00:00.000Z');
const reportedAt = now - 2 * 60 * 60 * 1000;
const monthStartSeconds = monthStart / 1000;
const reportedAtSeconds = reportedAt / 1000;
const accountId = 12345;
const userKey = 'synthetic-private-user-key'.repeat(3);
const canary = 'secret-user@example.test:private';
const row = {
  gigabytes: 1.25,
  monthStart: monthStartSeconds,
  reportedAt: reportedAtSeconds,
};
const unavailable = { message: 'STUDIO_USAGE_UNAVAILABLE' };
function payload(changes = {}, accountChanges = {}) {
  return {
    data: {
      actor: {
        account: {
          id: accountId,
          nrql: { results: [{ ...row, ...changes }] },
          ...accountChanges,
        },
      },
    },
  };
}
function response(value = payload()) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
function fixture(options = {}) {
  const requests = [];
  const reader = createNewRelicUsageReader({
    accountId,
    userKey,
    now: () => now,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return response();
    },
    ...options,
  });
  return { reader, requests };
}

test('authenticates a bounded read of the exact account and UTC month without claiming an ingest upper bound', async () => {
  const f = fixture();
  const observed = await f.reader.read();
  assert.equal(observed.accountId, accountId);
  assert.equal(observed.approximateBytes, 1_250_000_000);
  assert.equal(observed.billingMonthUtc, '2026-09');
  assert.equal(observed.sourceReportedAt, new Date(reportedAt).toISOString());
  assert.equal(observed.generationAgeMs, 7_200_000);
  assert.equal(observed.ingestUpperBound, false);
  assert.equal(observed.scope, 'account');
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, 'https://api.newrelic.com/graphql');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.headers['API-Key'], userKey);
  assert.equal(init.headers['Accept-Encoding'], 'identity');
  assert.equal(
    init.headers['Content-Length'],
    String(Buffer.byteLength(init.body)),
  );
  const { query } = JSON.parse(init.body);
  assert.match(query, /account\(id: 12345\)/);
  assert.match(query, /consumingAccountId = 12345/);
  assert.match(
    query,
    /GigabytesIngested IS NOT NULL AND monthTimestamp IS NOT NULL/,
  );
  assert.match(query, /SINCE '2026-09-01T00:00:00.000Z'/);
  assert.match(query, /UNTIL '2026-09-08T12:30:00.000Z'/);
  assert.ok(!query.includes('mutation'));
  assert.ok(!init.body.includes(userKey));
  assert.ok(!JSON.stringify(observed).includes(userKey));
  assert.equal(init.signal.aborted, true);
});

test('distinguishes a reported zero from missing, partial, malformed or other-account usage', async () => {
  const zero = fixture({
    fetch: async () => response(payload({ gigabytes: 0 })),
  });
  assert.equal((await zero.reader.read()).approximateBytes, 0);
  for (const value of [
    {},
    { data: null },
    { errors: [{ message: canary }], ...payload() },
    payload({}, { id: accountId + 1 }),
    payload({}, { nrql: { results: [] } }),
    payload({}, { nrql: { results: [row, row] } }),
    ...[null, -1, '0', Number.MAX_SAFE_INTEGER].map((gigabytes) =>
      payload({ gigabytes }),
    ),
  ]) {
    const f = fixture({ fetch: async () => response(value) });
    await assert.rejects(f.reader.read(), unavailable);
  }
});

test('fails closed for a missing response and unsafe epoch values', async () => {
  for (const fetch of [
    async () => undefined,
    async () => response(payload({ monthStart: Number.MAX_SAFE_INTEGER })),
    async () => response(payload({ reportedAt: Number.MAX_SAFE_INTEGER })),
  ]) {
    const f = fixture({ fetch });
    await assert.rejects(f.reader.read(), unavailable);
  }
});

test('rejects stale or wrong-month evidence and does not infer month from the successful response time', async () => {
  for (const changes of [
    { monthStart: Date.parse('2026-08-01T00:00:00.000Z') / 1000 },
    { monthStart: null },
    { reportedAt: now + 1 },
    { reportedAt: reportedAtSeconds - 4 * 60 * 60 - 1 },
  ]) {
    const f = fixture({ fetch: async () => response(payload(changes)) });
    await assert.rejects(f.reader.read(), unavailable);
  }
  const seconds = fixture({
    fetch: async () => response(payload()),
  });
  assert.equal((await seconds.reader.read()).billingMonthUtc, '2026-09');
  const milliseconds = fixture({
    fetch: async () => response(payload({ monthStart, reportedAt })),
  });
  assert.equal(
    (await milliseconds.reader.read()).sourceReportedAt,
    new Date(reportedAt).toISOString(),
  );
  let current = now;
  const rollover = fixture({
    now: () => current,
    fetch: async () => {
      current = Date.parse('2026-10-01T00:00:00.000Z');
      return response();
    },
  });
  await assert.rejects(rollover.reader.read(), unavailable);
});

test('refuses usage or report-time regression while retaining the last accepted evidence', async () => {
  for (const changes of [
    { gigabytes: 0.5 },
    { reportedAt: reportedAtSeconds - 1 },
  ]) {
    let current = payload();
    const f = fixture({ fetch: async () => response(current) });
    await f.reader.read();
    current = payload(changes);
    await assert.rejects(f.reader.read(), unavailable);
    current = payload({ gigabytes: 1.5, reportedAt: reportedAtSeconds + 1 });
    assert.equal((await f.reader.read()).approximateBytes, 1_500_000_000);
  }
});

test('refuses a local clock regression before making another account query', async () => {
  let current = now;
  const f = fixture({ now: () => current });
  await f.reader.read();
  current -= 1;
  await assert.rejects(f.reader.read(), unavailable);
  assert.equal(f.requests.length, 1);
});

test('rejects redirects, HTTP failures and ambiguous JSON without returning provider text', async () => {
  for (const make of [
    () => new Response(canary, { status: 429 }),
    () =>
      new Response(canary, {
        status: 302,
        headers: { location: 'https://untrusted.example/' },
      }),
    () => new Response(canary, { headers: { 'content-type': 'text/html' } }),
    () =>
      new Response(JSON.stringify(payload()), {
        headers: { 'content-type': 'application/json', 'content-length': '1' },
      }),
    () =>
      new Response(JSON.stringify(payload()), {
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
      }),
    () =>
      new Response(
        '{"data":null,"data":' + JSON.stringify(payload().data) + '}',
        { headers: { 'content-type': 'application/json' } },
      ),
    () =>
      new Response(new Uint8Array([0xff]), {
        headers: { 'content-type': 'application/json' },
      }),
  ]) {
    let calls = 0;
    const f = fixture({
      fetch: async () => {
        calls++;
        return make();
      },
    });
    await assert.rejects(f.reader.read(), unavailable);
    assert.equal(calls, 1);
  }
});

test('enforces a streaming response size limit and cancels oversized bodies', async () => {
  let cancelled = 0;
  const f = fixture({
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.alloc(16_385));
          },
          cancel() {
            cancelled++;
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  });
  await assert.rejects(f.reader.read(), unavailable);
  assert.equal(cancelled, 1);
});

test('bounds stalled headers, cancels late response bodies and never retries automatically', async () => {
  let release;
  let cancelled = 0;
  let calls = 0;
  let signal;
  const f = fixture({
    timeoutMs: 100,
    fetch: async (_url, init) => {
      calls++;
      signal = init.signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await assert.rejects(f.reader.read(), unavailable);
  assert.equal(signal.aborted, true);
  release(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      }),
    ),
  );
  await delay(0);
  assert.equal(cancelled, 1);
  assert.equal(calls, 1);
});

test('propagates cancellation while a response body is stalled and rejects a concurrent read', async () => {
  let cancelCount = 0;
  let reached;
  const entered = new Promise((resolve) => {
    reached = resolve;
  });
  const cancellation = new AbortController();
  const f = fixture({
    fetch: async () => {
      reached();
      return new Response(
        new ReadableStream({
          cancel() {
            cancelCount++;
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });
  const pending = f.reader.read({ signal: cancellation.signal });
  await entered;
  await delay(0);
  await assert.rejects(f.reader.read(), unavailable);
  cancellation.abort();
  await assert.rejects(pending, unavailable);
  assert.equal(cancelCount, 1);
  const already = fixture();
  await assert.rejects(
    already.reader.read({ signal: cancellation.signal }),
    unavailable,
  );
  assert.equal(already.requests.length, 0);
});

test('validates account, key and limits without leaking supplied configuration', async () => {
  for (const changes of [
    { accountId: 0 },
    { accountId: 2_147_483_648 },
    { accountId: '12345' },
    { userKey: canary.slice(0, 31) },
    { userKey: userKey + '\n' },
    { timeoutMs: 99 },
    { maximumReportAgeMs: 86_400_001 },
  ]) {
    assert.throws(() => fixture(changes), {
      message: 'STUDIO_USAGE_CONFIGURATION_INVALID',
    });
  }
  await assert.rejects(
    fixture({
      fetch: async () => {
        throw new Error(canary);
      },
    }).reader.read(),
    unavailable,
  );
});
