import { createHash } from 'node:crypto';

const MAX_BODY_BYTES = 16_384;
const SHA256 = /^[a-f0-9]{64}$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const TOKEN = /^[\x21-\x7e]{32,4096}$/;
const CODES = new Set([
  'ANCHOR_CLIENT_INPUT_INVALID',
  'ANCHOR_CLIENT_REQUEST_FAILED',
  'ANCHOR_CLIENT_RESPONSE_INVALID',
]);

export class ObservabilityAnchorClientError extends Error {
  constructor(code) {
    const fixed = CODES.has(code) ? code : 'ANCHOR_CLIENT_REQUEST_FAILED';
    super(fixed);
    this.name = 'ObservabilityAnchorClientError';
    this.code = fixed;
  }
}

const refuse = (code) => {
  throw new ObservabilityAnchorClientError(code);
};
const integer = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;
const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).toSorted().join() === keys.toSorted().join();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = (value) => createHash('sha256').update(value).digest('hex');

function validateCheckpoint(
  value,
  accountIdentitySha256,
  code = 'ANCHOR_CLIENT_RESPONSE_INVALID',
) {
  if (
    !exact(value, [
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
    ]) ||
    value.format !== 2 ||
    value.accountIdentitySha256 !== accountIdentitySha256 ||
    !SHA256.test(value.bindingSha256) ||
    !SHA256.test(value.stateSha256) ||
    !MONTH.test(value.monthUtc) ||
    typeof value.lastObservedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.lastObservedAt)) ||
    new Date(Date.parse(value.lastObservedAt)).toISOString() !==
      value.lastObservedAt ||
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
      !value.exhausted)
  )
    refuse(code);
  const state = {
    bindingSha256: value.bindingSha256,
    exhausted: value.exhausted,
    finalSignalAttemptedBytes: value.finalSignalAttemptedBytes,
    format: 1,
    lastObservedAt: value.lastObservedAt,
    monthSequence: value.monthSequence,
    monthUtc: value.monthUtc,
    payloadAttemptedBytes: value.payloadAttemptedBytes,
    reservationSequence: value.reservationSequence,
  };
  if (value.stateSha256 !== digest(JSON.stringify(state))) refuse(code);
  return structuredClone(value);
}

function validatedEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    return refuse('ANCHOR_CLIENT_INPUT_INVALID');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash
  )
    refuse('ANCHOR_CLIENT_INPUT_INVALID');
  return endpoint.origin;
}

async function boundedJson(response, signal) {
  if (!(response instanceof Response)) refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  const cancelBody = () => {
    void response.body?.cancel().catch(() => undefined);
  };
  if (
    response.redirected ||
    response.status !== 200 ||
    response.headers.get('content-type') !== 'application/json' ||
    response.headers.get('cache-control') !== 'no-store'
  ) {
    cancelBody();
    refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && !/^(?:0|[1-9]\d*)$/.test(contentLength)) {
    cancelBody();
    refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  }
  const declared = contentLength === null ? null : Number(contentLength);
  if (declared !== null && declared > MAX_BODY_BYTES) {
    cancelBody();
    refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    cancelBody();
    refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  }
  const aborted = new Promise((_, reject) => {
    signal.addEventListener(
      'abort',
      () =>
        reject(
          new ObservabilityAnchorClientError('ANCHOR_CLIENT_REQUEST_FAILED'),
        ),
      { once: true },
    );
  });
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (declared !== null && declared !== size)
    refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString());
  } catch {
    return refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
  }
}

export function createObservabilityAnchorClient({
  accountIdentitySha256,
  authority,
  endpoint,
  fetch: fetchImplementation = globalThis.fetch,
  operationTimeoutMs = 5_000,
  token,
}) {
  if (
    !SHA256.test(accountIdentitySha256) ||
    !['forwarder', 'operator'].includes(authority) ||
    !TOKEN.test(token) ||
    typeof fetchImplementation !== 'function' ||
    !integer(operationTimeoutMs, 100) ||
    operationTimeoutMs > 30_000
  )
    refuse('ANCHOR_CLIENT_INPUT_INVALID');
  const origin = validatedEndpoint(endpoint);

  async function post(path, body, expected) {
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES)
      refuse('ANCHOR_CLIENT_INPUT_INVALID');
    const cancellation = new AbortController();
    const timer = setTimeout(() => cancellation.abort(), operationTimeoutMs);
    const aborted = new Promise((_, reject) => {
      cancellation.signal.addEventListener(
        'abort',
        () =>
          reject(
            new ObservabilityAnchorClientError('ANCHOR_CLIENT_REQUEST_FAILED'),
          ),
        { once: true },
      );
    });
    try {
      const responsePromise = Promise.resolve(
        fetchImplementation(`${origin}${path}`, {
          body: serialized,
          headers: {
            'authorization': `Bearer ${token}`,
            'content-length': String(Buffer.byteLength(serialized)),
            'content-type': 'application/json',
          },
          method: 'POST',
          redirect: 'manual',
          signal: cancellation.signal,
        }),
      );
      void responsePromise
        .then((lateResponse) => {
          if (cancellation.signal.aborted && lateResponse instanceof Response)
            return lateResponse.body?.cancel();
          return undefined;
        })
        .catch(() => undefined);
      const response = await Promise.race([responsePromise, aborted]);
      const payload = await boundedJson(response, cancellation.signal);
      if (!exact(payload, ['checkpoint', 'format']) || payload.format !== 1)
        refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
      const observed = validateCheckpoint(
        payload.checkpoint,
        accountIdentitySha256,
      );
      if (expected && !same(observed, expected))
        refuse('ANCHOR_CLIENT_RESPONSE_INVALID');
      return observed;
    } catch (error) {
      if (error instanceof ObservabilityAnchorClientError) throw error;
      return refuse('ANCHOR_CLIENT_REQUEST_FAILED');
    } finally {
      cancellation.abort();
      clearTimeout(timer);
    }
  }

  const read = (requestedAccountIdentitySha256 = accountIdentitySha256) => {
    if (requestedAccountIdentitySha256 !== accountIdentitySha256)
      return Promise.reject(
        new ObservabilityAnchorClientError('ANCHOR_CLIENT_INPUT_INVALID'),
      );
    return post('/v1/read', { format: 1 });
  };
  if (authority === 'forwarder')
    return Object.freeze({
      advance: async (previous, next) => {
        const validatedPrevious = validateCheckpoint(
          previous,
          accountIdentitySha256,
          'ANCHOR_CLIENT_INPUT_INVALID',
        );
        const validatedNext = validateCheckpoint(
          next,
          accountIdentitySha256,
          'ANCHOR_CLIENT_INPUT_INVALID',
        );
        await post(
          '/v1/advance',
          { format: 1, next: validatedNext, previous: validatedPrevious },
          validatedNext,
        );
      },
      read,
    });
  return Object.freeze({
    advanceMonth: async (previous, next, authorization) => {
      const validatedPrevious = validateCheckpoint(
        previous,
        accountIdentitySha256,
        'ANCHOR_CLIENT_INPUT_INVALID',
      );
      const validatedNext = validateCheckpoint(
        next,
        accountIdentitySha256,
        'ANCHOR_CLIENT_INPUT_INVALID',
      );
      if (
        typeof authorization !== 'string' ||
        authorization.length < 1 ||
        authorization.length > 4_096
      )
        refuse('ANCHOR_CLIENT_INPUT_INVALID');
      await post(
        '/v1/advance-month',
        {
          authorization,
          format: 1,
          next: validatedNext,
          previous: validatedPrevious,
        },
        validatedNext,
      );
    },
    initialize: async (next) => {
      const validated = validateCheckpoint(
        next,
        accountIdentitySha256,
        'ANCHOR_CLIENT_INPUT_INVALID',
      );
      await post('/v1/initialize', { format: 1, next: validated }, validated);
    },
    read,
  });
}
