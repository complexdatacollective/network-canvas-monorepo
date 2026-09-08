import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  createNewRelicLogTransport,
  NEW_RELIC_LOG_WIRE_SCHEMA_IDENTITY,
} from '../apps/studio/deployment/managed/observability-new-relic-logs.mjs';
import { AUTHENTICATED_FLY_NATS_TRANSPORT } from './studio-managed-fly-log-envelope.mjs';

const now = Date.parse('2026-09-08T12:34:57.000Z');
const bindingSha256 = 'a'.repeat(64);
const licenseKey = 'synthetic-license-key'.repeat(4);
const canary = 'private-person@example.test/SecretToken';
const applications = {
  'studio-production': 'nc-studio-production',
  'studio-staging': 'nc-studio-staging',
  'registry-production': 'nc-registry-production',
  'registry-staging': 'nc-registry-staging',
};
function entries(changes = {}) {
  return [
    {
      provenance: {
        transport: AUTHENTICATED_FLY_NATS_TRANSPORT,
        subject: 'logs.nc-studio-production.iad.18574832b905e8',
      },
      payload: Buffer.from(
        JSON.stringify({
          event: { provider: 'app' },
          fly: {
            app: { instance: '18574832b905e8', name: 'nc-studio-production' },
            region: 'iad',
          },
          host: '18574832b905e8',
          log: { level: 'info' },
          message: JSON.stringify({
            level: 30,
            time: '2026-09-08T12:34:56.789Z',
            event: 'http_request',
            request_id: '123e4567-e89b-42d3-a456-426614174000',
            route: '/healthz',
            method: 'GET',
            status: 200,
            duration_ms: 1.25,
            ...changes,
          }),
          timestamp: '2026-09-08T12:34:57.123456789Z',
        }),
      ),
    },
  ];
}
function receipt(attempt, sequence = 1, changes = {}) {
  return {
    attemptId: attempt.attemptId,
    attemptedEstimatedBytes: attempt.wireBytes * 2,
    attemptBindingSha256: attempt.attemptBindingSha256,
    bindingSha256,
    exhausted: false,
    kind: 'estimated-ingest',
    monthSequence: 1,
    monthUtc: '2026-09',
    payloadRemainingBytes: 10_000,
    payloadSha256: attempt.payloadSha256,
    recordCount: attempt.recordCount,
    reservationSequence: sequence,
    schemaIdentity: attempt.schemaIdentity,
    wireBytes: attempt.wireBytes,
    ...changes,
  };
}
function fixture(overrides = {}) {
  const reservations = [];
  const requests = [];
  const transport = createNewRelicLogTransport({
    bindingSha256,
    flyConfiguration: { region: 'iad', applications },
    licenseKey,
    now: () => now,
    reserveAttempt: async (input) => {
      reservations.push(input);
      return receipt(input, reservations.length);
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return new Response(null, { status: 202 });
    },
    ...overrides,
  });
  return { transport, reservations, requests };
}

test('sends only framed sanitized logs to the fixed US endpoint after charging exact wire bytes', async () => {
  const f = fixture();
  assert.equal((await f.transport.send(entries())).outcome, 'accepted');
  assert.equal(f.reservations.length, 1);
  assert.equal(f.requests.length, 1);
  const { url, options } = f.requests[0];
  assert.equal(url, 'https://log-api.newrelic.com/log/v1');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers['Api-Key'], licenseKey);
  assert.equal(options.headers['Content-Type'], 'application/json');
  const wireBytes = Buffer.byteLength(options.body);
  assert.equal(options.headers['Content-Length'], String(wireBytes));
  assert.equal(f.reservations[0].wireBytes, wireBytes);
  assert.equal(
    f.reservations[0].schemaIdentity,
    NEW_RELIC_LOG_WIRE_SCHEMA_IDENTITY,
  );
  assert.match(f.reservations[0].payloadSha256, /^[a-f0-9]{64}$/);
  const body = JSON.parse(options.body);
  assert.equal(body[0].logs[0].message, 'http_request');
  assert.equal(body[0].logs[0].attributes.route, '/healthz');
  assert.equal(body[0].logs[0].timestamp, now - 211);
  assert.ok(!options.body.includes(canary));
  assert.ok(!options.body.includes(licenseKey));
  assert.ok(!url.includes(licenseKey));
});

test('constructs a native Fetch request with the exact authenticated payload', async () => {
  let nativeRequest;
  const f = fixture({
    fetch: async (url, options) => {
      nativeRequest = new Request(url, options);
      return new Response(null, { status: 202 });
    },
  });
  assert.equal((await f.transport.send(entries())).outcome, 'accepted');
  assert.equal(nativeRequest.url, 'https://log-api.newrelic.com/log/v1');
  assert.equal(nativeRequest.method, 'POST');
  assert.equal(nativeRequest.redirect, 'manual');
  assert.equal(nativeRequest.headers.get('api-key'), licenseKey);
  assert.equal(nativeRequest.headers.get('content-type'), 'application/json');
  const body = await nativeRequest.text();
  assert.equal(
    nativeRequest.headers.get('content-length'),
    String(Buffer.byteLength(body)),
  );
  assert.equal(nativeRequest.signal.aborted, true);
});

test('normalizes invalid Fly adapter configuration without exposing adapter details', () => {
  assert.throws(
    () =>
      fixture({
        flyConfiguration: { region: 'not-a-region', applications },
      }),
    { message: 'STUDIO_LOG_CLIENT_CONFIGURATION_INVALID' },
  );
});

test('awaits durable reservation and bounds concurrency before the first network attempt', async () => {
  let release;
  const waiting = new Promise((resolve) => (release = resolve));
  let attemptedReservation;
  const f = fixture({
    reserveAttempt: (input) => {
      attemptedReservation = input;
      return waiting;
    },
  });
  const first = f.transport.send(entries());
  await delay(0);
  assert.equal(f.requests.length, 0);
  await assert.rejects(f.transport.send(entries()), /STUDIO_LOG_CLIENT_BUSY/);
  release(receipt(attemptedReservation));
  assert.equal((await first).outcome, 'accepted');
  assert.equal(f.requests.length, 1);
});

test('refuses unavailable, wrong-policy and undersized reservations before sending', async () => {
  for (const reserveAttempt of [
    async () => {
      throw new Error(canary);
    },
    async () => undefined,
    async (input) => receipt(input, 1, { bindingSha256: 'b'.repeat(64) }),
    async (input) => receipt(input, 1, { attemptedEstimatedBytes: 1 }),
    async (input) => receipt(input, 1, { kind: 'final-exhaustion-signal' }),
    async (input) => receipt(input, 1, { monthUtc: '2026-08' }),
    async (input) => receipt(input, 1, { payloadSha256: 'b'.repeat(64) }),
    async (input) => receipt(input, 1, { wireBytes: input.wireBytes + 1 }),
    async (input) => receipt(input, 1, { recordCount: input.recordCount + 1 }),
    async (input) => receipt(input, 1, { attemptId: 'cached-attempt' }),
    async (input) =>
      receipt(input, 1, { schemaIdentity: 'sha256:stale-schema' }),
    async (input) =>
      receipt(input, 1, { attemptBindingSha256: 'b'.repeat(64) }),
  ]) {
    const f = fixture({ reserveAttempt });
    await assert.rejects(f.transport.send(entries()), {
      message: 'STUDIO_LOG_BUDGET_UNAVAILABLE',
    });
    assert.equal(f.requests.length, 0);
  }
});

test('a reservation crossing a UTC month inside the fetch microtask stays charged but cannot send', async () => {
  let currentTime = now;
  let reads = 0;
  const f = fixture({
    now: () => {
      reads += 1;
      if (reads === 2)
        queueMicrotask(() => {
          currentTime = Date.parse('2026-10-01T00:00:00.000Z');
        });
      return currentTime;
    },
  });
  await assert.rejects(f.transport.send(entries()), {
    message: 'STUDIO_LOG_BUDGET_UNAVAILABLE',
  });
  assert.equal(f.reservations.length, 1);
  assert.equal(f.requests.length, 0);
  assert.equal(reads, 3);
});

test('replayed and backward reservation receipts cannot authorize another request', async () => {
  const replay = fixture({
    reserveAttempt: async (input) => receipt(input, 1),
  });
  assert.equal((await replay.transport.send(entries())).outcome, 'accepted');
  await assert.rejects(replay.transport.send(entries()), {
    message: 'STUDIO_LOG_BUDGET_UNAVAILABLE',
  });
  assert.equal(replay.requests.length, 1);

  let sequence = 3;
  const backward = fixture({
    reserveAttempt: async (input) => receipt(input, sequence--),
  });
  assert.equal((await backward.transport.send(entries())).outcome, 'accepted');
  await assert.rejects(backward.transport.send(entries()), {
    message: 'STUDIO_LOG_BUDGET_UNAVAILABLE',
  });
  assert.equal(backward.requests.length, 1);
});

test('a new collector instance refuses a cached receipt for identical payload bytes', async () => {
  let cached;
  const reserveAttempt = async (input) => (cached ??= receipt(input, 1));
  const original = fixture({ reserveAttempt });
  assert.equal((await original.transport.send(entries())).outcome, 'accepted');
  const restarted = fixture({ reserveAttempt });
  await assert.rejects(restarted.transport.send(entries()), {
    message: 'STUDIO_LOG_BUDGET_UNAVAILABLE',
  });
  assert.equal(restarted.requests.length, 0);
});

test('drops stale, future, private-route and oversized inputs without charging or transmitting', async () => {
  const f = fixture();
  for (const input of [
    entries({ time: '2026-09-01T00:00:00.000Z' }),
    entries({ time: '2026-09-09T00:00:00.000Z' }),
    entries({ route: `/rpc/${canary}` }),
    entries({ body: canary }),
    [{ ...entries()[0], payload: Buffer.alloc(8193) }],
  ])
    assert.deepEqual(await f.transport.send(input), {
      outcome: 'dropped',
      recordCount: 0,
    });
  assert.equal(f.reservations.length, 0);
  assert.equal(f.requests.length, 0);
});

test('an expired reservation never authorizes a late network request', async () => {
  let release;
  let signal;
  let attemptedReservation;
  const f = fixture({
    timeoutMs: 100,
    reserveAttempt: (input) => {
      signal = input.signal;
      attemptedReservation = input;
      return new Promise((resolve) => (release = resolve));
    },
  });
  await assert.rejects(f.transport.send(entries()), {
    message: 'STUDIO_LOG_BUDGET_UNAVAILABLE',
  });
  assert.equal(signal.aborted, true);
  release(receipt(attemptedReservation));
  await delay(0);
  assert.equal(f.requests.length, 0);
});

test('every caller retry receives a new charge and no automatic retry or provider text escapes', async () => {
  const reservations = [];
  let attempts = 0;
  let cancelled = 0;
  const f = fixture({
    reserveAttempt: async (input) => {
      reservations.push(input);
      return receipt(input, reservations.length);
    },
    fetch: async () => {
      attempts += 1;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from(canary));
          },
          cancel() {
            cancelled += 1;
          },
        }),
        { status: attempts === 1 ? 429 : 202 },
      );
    },
  });
  const first = await f.transport.send(entries());
  assert.equal(first.outcome, 'unaccepted');
  assert.equal(first.reservationSequence, 1);
  assert.equal(attempts, 1);
  const second = await f.transport.send(entries());
  assert.equal(second.outcome, 'accepted');
  assert.equal(second.reservationSequence, 2);
  assert.equal(reservations.length, 2);
  assert.equal(cancelled, 2);
  assert.ok(!JSON.stringify([first, second]).includes(canary));
});

test('transport failure and a late stalled response remain charged and cancel their bodies', async () => {
  let respond;
  let signal;
  let cancellations = 0;
  const f = fixture({
    timeoutMs: 100,
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => (respond = resolve));
    },
  });
  await assert.rejects(f.transport.send(entries()), {
    message: 'STUDIO_LOG_TRANSPORT_UNCERTAIN',
  });
  assert.equal(f.reservations.length, 1);
  assert.equal(signal.aborted, true);
  respond(
    new Response(
      new ReadableStream({
        cancel() {
          cancellations += 1;
        },
      }),
      { status: 202 },
    ),
  );
  await delay(0);
  assert.equal(cancellations, 1);
  const failed = fixture({
    fetch: async () => {
      throw new Error(canary);
    },
  });
  await assert.rejects(failed.transport.send(entries()), {
    message: 'STUDIO_LOG_TRANSPORT_UNCERTAIN',
  });
  assert.equal(failed.reservations.length, 1);
});
