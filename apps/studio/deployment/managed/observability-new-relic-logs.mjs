import { createHash, randomUUID } from 'node:crypto';

import { createAuthenticatedFlyLogAdapter } from '../../../../scripts/studio-managed-fly-log-envelope.mjs';
import { MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY } from '../../../../scripts/studio-managed-log-sanitizer.mjs';

const ENDPOINT = 'https://log-api.newrelic.com/log/v1';
const MAX_BODY_BYTES = 262_144;
const SHA256 = /^[a-f0-9]{64}$/;
// Bind measured storage expansion to the provider wrapper as well as the
// sanitized attributes. Changing either requires new qualification evidence.
export const NEW_RELIC_LOG_WIRE_SCHEMA_IDENTITY = `sha256:${createHash('sha256')
  .update(
    JSON.stringify({
      version: 1,
      sourceSchema: MANAGED_OPERATIONAL_LOG_SCHEMA_IDENTITY,
      logtype: 'network-canvas-operational',
      format: 'detailed-array.logs.timestamp-message-attributes',
      message: 'fixed-event-kind',
    }),
  )
  .digest('hex')}`;
const codes = new Set([
  'STUDIO_LOG_CLIENT_CONFIGURATION_INVALID',
  'STUDIO_LOG_CLIENT_BUSY',
  'STUDIO_LOG_BATCH_INVALID',
  'STUDIO_LOG_BUDGET_UNAVAILABLE',
  'STUDIO_LOG_TRANSPORT_UNCERTAIN',
]);
const refuse = (code) => {
  throw new Error(codes.has(code) ? code : 'STUDIO_LOG_TRANSPORT_UNCERTAIN');
};
const integer = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;

function monthUtc(currentTime) {
  if (!integer(currentTime)) return undefined;
  try {
    return new Date(currentTime).toISOString().slice(0, 7);
  } catch {
    return undefined;
  }
}

function validReservation(value, bindingSha256, attempt, currentTime) {
  const expectedMonth = monthUtc(currentTime);
  return (
    expectedMonth !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    value.kind === 'estimated-ingest' &&
    value.bindingSha256 === bindingSha256 &&
    integer(value.attemptedEstimatedBytes, attempt.wireBytes) &&
    integer(value.monthSequence, 1) &&
    value.monthUtc === expectedMonth &&
    integer(value.reservationSequence, 1) &&
    integer(value.payloadRemainingBytes) &&
    typeof value.exhausted === 'boolean' &&
    value.payloadSha256 === attempt.payloadSha256 &&
    value.schemaIdentity === attempt.schemaIdentity &&
    value.wireBytes === attempt.wireBytes &&
    value.recordCount === attempt.recordCount &&
    value.attemptId === attempt.attemptId &&
    value.attemptBindingSha256 === attempt.attemptBindingSha256
  );
}

function reservationAdvances(previous, reservation) {
  if (previous === undefined) return true;
  if (reservation.monthSequence < previous.monthSequence) return false;
  if (reservation.monthSequence === previous.monthSequence)
    return (
      reservation.monthUtc === previous.monthUtc &&
      reservation.reservationSequence > previous.reservationSequence
    );
  return reservation.monthUtc > previous.monthUtc;
}

/**
 * One charged attempt, with no internal queue or retry. The collector owns NATS
 * authentication and supplies reserveAttempt, which must authenticate fresh
 * provider usage/expansion evidence and await the durable shared budget. This
 * transport does not qualify that evidence or assume a stored-byte multiplier.
 */
export function createNewRelicLogTransport({
  bindingSha256,
  flyConfiguration,
  licenseKey,
  reserveAttempt,
  fetch: fetchImplementation = globalThis.fetch,
  now = Date.now,
  timeoutMs = 10_000,
}) {
  if (
    typeof bindingSha256 !== 'string' ||
    !SHA256.test(bindingSha256) ||
    typeof licenseKey !== 'string' ||
    !/^[\x21-\x7e]{32,4096}$/.test(licenseKey) ||
    typeof reserveAttempt !== 'function' ||
    typeof fetchImplementation !== 'function' ||
    typeof now !== 'function' ||
    !integer(timeoutMs, 100) ||
    timeoutMs > 30_000
  )
    refuse('STUDIO_LOG_CLIENT_CONFIGURATION_INVALID');
  let adapter;
  try {
    adapter = createAuthenticatedFlyLogAdapter(flyConfiguration);
  } catch {
    refuse('STUDIO_LOG_CLIENT_CONFIGURATION_INVALID');
  }
  let busy = false;
  let previousReservation;
  return Object.freeze({
    async send(entries) {
      if (busy) refuse('STUDIO_LOG_CLIENT_BUSY');
      busy = true;
      const cancellation = new AbortController();
      let attempted = false;
      let timer;
      try {
        const currentTime = now();
        if (!integer(currentTime)) refuse('STUDIO_LOG_BATCH_INVALID');
        const records = adapter
          .sanitizeBatch(entries)
          .filter(
            (record) =>
              record.timestamp >= currentTime - 48 * 60 * 60 * 1000 &&
              record.timestamp <= currentTime + 5 * 60 * 1000,
          );
        if (records.length === 0) return { outcome: 'dropped', recordCount: 0 };
        const body = JSON.stringify([
          {
            common: { attributes: { logtype: 'network-canvas-operational' } },
            logs: records.map(({ timestamp, ...attributes }) => ({
              timestamp,
              message: attributes.event,
              attributes,
            })),
          },
        ]);
        const wireBytes = Buffer.byteLength(body);
        if (wireBytes > MAX_BODY_BYTES) refuse('STUDIO_LOG_BATCH_INVALID');
        const expired = new Promise((_, reject) => {
          timer = setTimeout(() => {
            cancellation.abort();
            reject(new Error('STUDIO_LOG_TRANSPORT_UNCERTAIN'));
          }, timeoutMs);
        });
        const payloadSha256 = createHash('sha256').update(body).digest('hex');
        const attempt = {
          // The same payload after restart is still a new billable attempt.
          // A cached receipt must not survive by matching only payload bytes.
          attemptId: randomUUID(),
          wireBytes,
          recordCount: records.length,
          payloadSha256,
          schemaIdentity: NEW_RELIC_LOG_WIRE_SCHEMA_IDENTITY,
        };
        attempt.attemptBindingSha256 = createHash('sha256')
          .update(
            JSON.stringify({
              version: 1,
              bindingSha256,
              ...attempt,
            }),
          )
          .digest('hex');
        const reservation = await Promise.race([
          Promise.resolve().then(() =>
            reserveAttempt({
              ...attempt,
              signal: cancellation.signal,
            }),
          ),
          expired,
        ]);
        if (
          cancellation.signal.aborted ||
          !validReservation(reservation, bindingSha256, attempt, now()) ||
          !reservationAdvances(previousReservation, reservation)
        )
          refuse('STUDIO_LOG_BUDGET_UNAVAILABLE');
        previousReservation = Object.freeze({
          monthSequence: reservation.monthSequence,
          monthUtc: reservation.monthUtc,
          reservationSequence: reservation.reservationSequence,
        });
        const pendingResponse = Promise.resolve().then(() => {
          if (
            cancellation.signal.aborted ||
            monthUtc(now()) !== reservation.monthUtc
          )
            refuse('STUDIO_LOG_BUDGET_UNAVAILABLE');
          attempted = true;
          return fetchImplementation(ENDPOINT, {
            method: 'POST',
            headers: {
              'Api-Key': licenseKey,
              'Content-Type': 'application/json',
              'Content-Length': String(wireBytes),
            },
            body,
            redirect: 'manual',
            signal: cancellation.signal,
          });
        });
        void pendingResponse
          .then((response) => {
            if (cancellation.signal.aborted && response instanceof Response)
              return response.body?.cancel();
            return undefined;
          })
          .catch(() => undefined);
        const response = await Promise.race([pendingResponse, expired]);
        if (!(response instanceof Response))
          refuse('STUDIO_LOG_TRANSPORT_UNCERTAIN');
        // Provider text is neither required for acknowledgement nor safe to log.
        void response.body?.cancel().catch(() => undefined);
        if (response.redirected) refuse('STUDIO_LOG_TRANSPORT_UNCERTAIN');
        return {
          outcome:
            response.status >= 200 && response.status < 300
              ? 'accepted'
              : 'unaccepted',
          status: response.status,
          recordCount: records.length,
          wireBytes,
          reservationSequence: reservation.reservationSequence,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          ['STUDIO_LOG_BATCH_INVALID', 'STUDIO_LOG_CLIENT_BUSY'].includes(
            error.message,
          )
        )
          return refuse(error.message);
        return refuse(
          attempted
            ? 'STUDIO_LOG_TRANSPORT_UNCERTAIN'
            : 'STUDIO_LOG_BUDGET_UNAVAILABLE',
        );
      } finally {
        cancellation.abort();
        clearTimeout(timer);
        busy = false;
      }
    },
  });
}
