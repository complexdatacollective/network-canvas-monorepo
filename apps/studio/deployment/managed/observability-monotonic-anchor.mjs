import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 16_384;
const SHA256 = /^[a-f0-9]{64}$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const CODES = new Set([
  'ANCHOR_AUTH_REQUIRED',
  'ANCHOR_CONFLICT',
  'ANCHOR_INPUT_INVALID',
  'ANCHOR_INTERNAL_FAILURE',
  'ANCHOR_LINEAGE_MISSING',
  'ANCHOR_METHOD_FORBIDDEN',
  'ANCHOR_MONTH_AUTHORIZATION_REQUIRED',
  'ANCHOR_STATE_INVALID',
]);

class MonotonicAnchorError extends Error {
  constructor(code) {
    const safe = CODES.has(code) ? code : 'ANCHOR_INTERNAL_FAILURE';
    super(safe);
    this.name = 'MonotonicAnchorError';
    this.code = safe;
  }
}

const refuse = (code) => {
  throw new MonotonicAnchorError(code);
};
const integer = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;
const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).toSorted().join() === keys.toSorted().join();
const canonicalTime = (value) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
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

function validateMonotonicCheckpoint(value) {
  const keys = [
    'accountIdentitySha256',
    'bindingSha256',
    'exhausted',
    'finalSignalAttemptedBytes',
    'finalSignalReserveBytes',
    'format',
    'lastObservedAt',
    'monthSequence',
    'monthUtc',
    'payloadAttemptedBytes',
    'payloadLimitBytes',
    'reservationSequence',
    'stateSha256',
  ];
  if (
    !exact(value, keys) ||
    value.format !== 2 ||
    !SHA256.test(value.accountIdentitySha256) ||
    !SHA256.test(value.bindingSha256) ||
    !SHA256.test(value.stateSha256) ||
    !MONTH.test(value.monthUtc) ||
    !canonicalTime(value.lastObservedAt) ||
    value.lastObservedAt.slice(0, 7) !== value.monthUtc ||
    !integer(value.monthSequence, 1) ||
    !integer(value.reservationSequence) ||
    !integer(value.payloadLimitBytes, 1) ||
    !integer(value.finalSignalReserveBytes, 1) ||
    !integer(value.payloadAttemptedBytes) ||
    value.payloadAttemptedBytes > value.payloadLimitBytes ||
    !integer(value.finalSignalAttemptedBytes) ||
    value.finalSignalAttemptedBytes > value.finalSignalReserveBytes ||
    typeof value.exhausted !== 'boolean' ||
    (value.finalSignalAttemptedBytes > 0 && !value.exhausted) ||
    (value.payloadAttemptedBytes === value.payloadLimitBytes &&
      !value.exhausted) ||
    value.stateSha256 !== stateDigest(value)
  )
    refuse('ANCHOR_STATE_INVALID');
  return structuredClone(value);
}

function initial(checkpoint) {
  return (
    checkpoint.monthSequence === 1 &&
    checkpoint.reservationSequence === 0 &&
    checkpoint.payloadAttemptedBytes === 0 &&
    checkpoint.finalSignalAttemptedBytes === 0 &&
    checkpoint.exhausted === false
  );
}

function nextMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 12
    ? `${year + 1}-01`
    : `${year}-${String(number + 1).padStart(2, '0')}`;
}

function samePolicy(previous, next) {
  return (
    previous.accountIdentitySha256 === next.accountIdentitySha256 &&
    previous.bindingSha256 === next.bindingSha256 &&
    previous.payloadLimitBytes === next.payloadLimitBytes &&
    previous.finalSignalReserveBytes === next.finalSignalReserveBytes
  );
}

function validateAdvance(previous, next) {
  const payloadChanged =
    next.payloadAttemptedBytes !== previous.payloadAttemptedBytes;
  const signalChanged =
    next.finalSignalAttemptedBytes !== previous.finalSignalAttemptedBytes;
  if (
    !samePolicy(previous, next) ||
    previous.monthUtc !== next.monthUtc ||
    previous.monthSequence !== next.monthSequence ||
    next.reservationSequence < previous.reservationSequence ||
    next.reservationSequence > previous.reservationSequence + 1 ||
    next.payloadAttemptedBytes < previous.payloadAttemptedBytes ||
    next.finalSignalAttemptedBytes < previous.finalSignalAttemptedBytes ||
    Date.parse(next.lastObservedAt) < Date.parse(previous.lastObservedAt) ||
    (previous.exhausted && !next.exhausted) ||
    (previous.exhausted && payloadChanged) ||
    (signalChanged &&
      (!previous.exhausted || previous.finalSignalAttemptedBytes !== 0)) ||
    same(previous, next)
  )
    refuse('ANCHOR_STATE_INVALID');
  if (
    (payloadChanged && signalChanged) ||
    ((payloadChanged || signalChanged) &&
      next.reservationSequence !== previous.reservationSequence + 1) ||
    (!payloadChanged &&
      !signalChanged &&
      next.reservationSequence !== previous.reservationSequence)
  )
    refuse('ANCHOR_STATE_INVALID');
}

function validateMonth(previous, next) {
  if (
    !samePolicy(previous, next) ||
    next.monthUtc !== nextMonth(previous.monthUtc) ||
    next.monthSequence !== previous.monthSequence + 1 ||
    next.reservationSequence !== 0 ||
    next.payloadAttemptedBytes !== 0 ||
    next.finalSignalAttemptedBytes !== 0 ||
    next.exhausted !== false ||
    Date.parse(next.lastObservedAt) < Date.parse(previous.lastObservedAt)
  )
    refuse('ANCHOR_STATE_INVALID');
}

async function readBody(request) {
  if (request.headers.get('content-type') !== 'application/json')
    refuse('ANCHOR_INPUT_INVALID');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    refuse('ANCHOR_INPUT_INVALID');
  const reader = request.body?.getReader();
  if (!reader) refuse('ANCHOR_INPUT_INVALID');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) refuse('ANCHOR_INPUT_INVALID');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString());
  } catch {
    return refuse('ANCHOR_INPUT_INVALID');
  }
}

function json(status, body) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/**
 * HTTP boundary for one fixed account lineage. The injected store owns an
 * independently durable create-once marker and atomic full-checkpoint CAS.
 */
export function createMonotonicAnchorHandler({
  accountIdentitySha256,
  authenticate,
  authorizeMonth,
  store,
  operationTimeoutMs = 5_000,
}) {
  if (
    !SHA256.test(accountIdentitySha256) ||
    typeof authenticate !== 'function' ||
    typeof authorizeMonth !== 'function' ||
    !store ||
    typeof store.read !== 'function' ||
    typeof store.initialize !== 'function' ||
    typeof store.compareAndSet !== 'function' ||
    !integer(operationTimeoutMs, 100) ||
    operationTimeoutMs > 30_000
  )
    refuse('ANCHOR_INPUT_INVALID');

  async function current() {
    const value = await store.read();
    if (value === null) refuse('ANCHOR_LINEAGE_MISSING');
    const checkpoint = validateMonotonicCheckpoint(value);
    if (checkpoint.accountIdentitySha256 !== accountIdentitySha256)
      refuse('ANCHOR_STATE_INVALID');
    return checkpoint;
  }

  return async (request) => {
    let timer;
    const operation = (async () => {
      try {
        if (!(request instanceof Request) || request.method !== 'POST')
          refuse('ANCHOR_INPUT_INVALID');
        const principal = await authenticate(request);
        if (
          !exact(principal, ['accountIdentitySha256', 'authority']) ||
          principal.accountIdentitySha256 !== accountIdentitySha256 ||
          !['forwarder', 'operator'].includes(principal.authority)
        )
          refuse('ANCHOR_AUTH_REQUIRED');
        const body = await readBody(request);
        const pathname = new URL(request.url).pathname;
        if (pathname === '/v1/read') {
          if (!exact(body, ['format']) || body.format !== 1)
            refuse('ANCHOR_INPUT_INVALID');
          return json(200, { checkpoint: await current(), format: 1 });
        }
        if (pathname === '/v1/initialize') {
          if (principal.authority !== 'operator')
            refuse('ANCHOR_METHOD_FORBIDDEN');
          if (!exact(body, ['format', 'next']) || body.format !== 1)
            refuse('ANCHOR_INPUT_INVALID');
          const next = validateMonotonicCheckpoint(body.next);
          if (
            next.accountIdentitySha256 !== accountIdentitySha256 ||
            !initial(next)
          )
            refuse('ANCHOR_STATE_INVALID');
          if (!(await store.initialize(next))) refuse('ANCHOR_CONFLICT');
          if (!same(await current(), next)) refuse('ANCHOR_INTERNAL_FAILURE');
          return json(200, { checkpoint: next, format: 1 });
        }
        if (pathname === '/v1/advance') {
          if (principal.authority !== 'forwarder')
            refuse('ANCHOR_METHOD_FORBIDDEN');
          if (!exact(body, ['format', 'next', 'previous']) || body.format !== 1)
            refuse('ANCHOR_INPUT_INVALID');
          const previous = validateMonotonicCheckpoint(body.previous);
          const next = validateMonotonicCheckpoint(body.next);
          validateAdvance(previous, next);
          if (!(await store.compareAndSet(previous, next)))
            refuse('ANCHOR_CONFLICT');
          if (!same(await current(), next)) refuse('ANCHOR_INTERNAL_FAILURE');
          return json(200, { checkpoint: next, format: 1 });
        }
        if (pathname === '/v1/advance-month') {
          if (principal.authority !== 'operator')
            refuse('ANCHOR_METHOD_FORBIDDEN');
          if (
            !exact(body, ['authorization', 'format', 'next', 'previous']) ||
            body.format !== 1 ||
            typeof body.authorization !== 'string' ||
            body.authorization.length < 1 ||
            body.authorization.length > 4_096
          )
            refuse('ANCHOR_INPUT_INVALID');
          const previous = validateMonotonicCheckpoint(body.previous);
          const next = validateMonotonicCheckpoint(body.next);
          validateMonth(previous, next);
          if (
            !(await authorizeMonth({
              authorization: body.authorization,
              next,
              previous,
              principal,
            }))
          )
            refuse('ANCHOR_MONTH_AUTHORIZATION_REQUIRED');
          if (!(await store.compareAndSet(previous, next)))
            refuse('ANCHOR_CONFLICT');
          if (!same(await current(), next)) refuse('ANCHOR_INTERNAL_FAILURE');
          return json(200, { checkpoint: next, format: 1 });
        }
        return refuse('ANCHOR_INPUT_INVALID');
      } catch (error) {
        const code =
          error instanceof MonotonicAnchorError
            ? error.code
            : 'ANCHOR_INTERNAL_FAILURE';
        const status =
          code === 'ANCHOR_AUTH_REQUIRED'
            ? 401
            : code === 'ANCHOR_METHOD_FORBIDDEN'
              ? 403
              : code === 'ANCHOR_CONFLICT'
                ? 409
                : code === 'ANCHOR_INTERNAL_FAILURE'
                  ? 503
                  : 400;
        return json(status, { code });
      }
    })();
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        void request.body?.cancel().catch(() => undefined);
        resolve(json(503, { code: 'ANCHOR_INTERNAL_FAILURE' }));
      }, operationTimeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
}

export function fixedBearerAuthenticator({
  accountIdentitySha256,
  forwarderToken,
  operatorToken,
}) {
  const tokens = [
    ['forwarder', forwarderToken],
    ['operator', operatorToken],
  ];
  if (
    !SHA256.test(accountIdentitySha256) ||
    tokens.some(
      ([, token]) => typeof token !== 'string' || token.length < 32,
    ) ||
    forwarderToken === operatorToken
  )
    refuse('ANCHOR_INPUT_INVALID');
  return async (request) => {
    const header = request.headers.get('authorization') ?? '';
    const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
    for (const [authority, token] of tokens) {
      const left = Buffer.from(supplied);
      const right = Buffer.from(token);
      if (left.length === right.length && timingSafeEqual(left, right))
        return { accountIdentitySha256, authority };
    }
    return null;
  };
}
