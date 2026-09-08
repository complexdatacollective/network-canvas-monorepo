import { createHash } from 'node:crypto';

import { hasDuplicateJsonObjectKeys } from '../../../../scripts/studio-managed-strict-json.mjs';

const ENDPOINT = 'https://api.newrelic.com/graphql';
const MAX_RESPONSE_BYTES = 16_384;
const DAY_MS = 86_400_000;
const integer = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (code = 'STUDIO_USAGE_UNAVAILABLE') => {
  throw new Error(code);
};

function instant(value) {
  if (!integer(value)) refuse();
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) refuse();
  return date;
}

/**
 * New Relic documents NrMTDConsumption timestamps as UNIX seconds. Accept either
 * seconds or milliseconds defensively, requiring exactly one candidate to satisfy
 * the query's
 * already-known bounds. Never infer a unit from the current clock alone.
 */
function normalizeEpoch(value, minimum, maximum) {
  if (!integer(value)) refuse();
  const candidates = [value, value * 1000].filter(
    (candidate) =>
      Number.isSafeInteger(candidate) &&
      candidate >= minimum &&
      candidate <= maximum,
  );
  if (candidates.length !== 1) refuse();
  return candidates[0];
}

function monthStart(value) {
  const date = instant(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function cancel(response) {
  if (response instanceof Response)
    void response.body?.cancel().catch(() => undefined);
}

async function readJson(response, aborted) {
  if (!(response instanceof Response)) refuse();
  const length = response.headers.get('content-length');
  if (
    response.status !== 200 ||
    response.redirected ||
    ![null, 'identity'].includes(response.headers.get('content-encoding')) ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      response.headers.get('content-type') ?? '',
    ) ||
    (length !== null &&
      (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
  ) {
    cancel(response);
    refuse();
  }
  const reader = response.body?.getReader();
  if (!reader) refuse();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) refuse();
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (length !== null && Number(length) !== size) refuse();
  const source = new TextDecoder('utf-8', { fatal: true }).decode(
    Buffer.concat(chunks, size),
  );
  if (hasDuplicateJsonObjectKeys(source)) refuse();
  return JSON.parse(source);
}

/**
 * Read-only account-scoped usage evidence. NrMTDConsumption is approximate and
 * delayed; it is neither a billing upper bound nor organization-wide coverage.
 * This reader cannot authorize forwarding or reset the durable monthly budget.
 */
export function createNewRelicUsageReader({
  accountId,
  userKey,
  fetch: fetchImplementation = globalThis.fetch,
  now = Date.now,
  timeoutMs = 10_000,
  maximumReportAgeMs = 4 * 60 * 60 * 1000,
}) {
  if (
    !integer(accountId, 1) ||
    accountId > 2_147_483_647 ||
    typeof userKey !== 'string' ||
    !/^[\x21-\x7e]{32,4096}$/.test(userKey) ||
    typeof fetchImplementation !== 'function' ||
    typeof now !== 'function' ||
    !integer(timeoutMs, 100) ||
    timeoutMs > 30_000 ||
    !integer(maximumReportAgeMs, 1) ||
    maximumReportAgeMs > DAY_MS
  )
    refuse('STUDIO_USAGE_CONFIGURATION_INVALID');
  let busy = false;
  let previous;
  return Object.freeze({
    async read({ signal } = {}) {
      if (busy || (signal !== undefined && !(signal instanceof AbortSignal)))
        refuse();
      busy = true;
      const controller = new AbortController();
      let timer;
      let forwardAbort;
      try {
        const started = now();
        if (previous && started < previous.observed) refuse();
        const start = monthStart(started);
        const until = instant(started).toISOString();
        const since = instant(start).toISOString();
        if (signal?.aborted) refuse();
        forwardAbort = () => controller.abort();
        signal?.addEventListener('abort', forwardAbort, { once: true });
        const aborted = new Promise((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new Error('STUDIO_USAGE_UNAVAILABLE')),
            { once: true },
          );
        });
        timer = setTimeout(() => controller.abort(), timeoutMs);
        const nrql = `FROM NrMTDConsumption SELECT latest(GigabytesIngested) AS gigabytes, latest(timestamp) AS reportedAt, latest(monthTimestamp) AS monthStart WHERE productLine = 'DataPlatform' AND consumingAccountId = ${accountId} AND GigabytesIngested IS NOT NULL AND monthTimestamp IS NOT NULL SINCE '${since}' UNTIL '${until}'`;
        const query = `{ actor { account(id: ${accountId}) { id nrql(query: ${JSON.stringify(nrql)}) { results } } } }`;
        const body = JSON.stringify({ query });
        const responsePromise = Promise.resolve().then(() => {
          if (controller.signal.aborted) refuse();
          return fetchImplementation(ENDPOINT, {
            method: 'POST',
            redirect: 'manual',
            headers: {
              'API-Key': userKey,
              'Accept-Encoding': 'identity',
              'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(body)),
            },
            body,
            signal: controller.signal,
          });
        });
        void responsePromise
          .then((response) => {
            if (controller.signal.aborted) cancel(response);
            return undefined;
          })
          .catch(() => undefined);
        const response = await Promise.race([responsePromise, aborted]);
        const payload = await readJson(response, aborted);
        const observed = now();
        if (
          controller.signal.aborted ||
          !integer(observed) ||
          observed < started ||
          monthStart(observed) !== start ||
          !record(payload) ||
          Object.hasOwn(payload, 'errors')
        )
          refuse();
        const account = payload.data?.actor?.account;
        const rows = account?.nrql?.results;
        if (
          !record(account) ||
          account.id !== accountId ||
          !Array.isArray(rows) ||
          rows.length !== 1
        )
          refuse();
        const row = rows[0];
        if (!record(row)) refuse();
        const reportedAt = normalizeEpoch(row.reportedAt, start, started);
        const reportedMonthStart = normalizeEpoch(row.monthStart, start, start);
        if (
          typeof row.gigabytes !== 'number' ||
          !Number.isFinite(row.gigabytes) ||
          row.gigabytes < 0 ||
          observed - reportedAt > maximumReportAgeMs ||
          reportedMonthStart !== start
        )
          refuse();
        const approximateBytes = Math.ceil(row.gigabytes * 1_000_000_000);
        if (!integer(approximateBytes)) refuse();
        if (
          previous &&
          (start < previous.start ||
            (start === previous.start &&
              (reportedAt < previous.reportedAt ||
                approximateBytes < previous.approximateBytes)))
        )
          refuse();
        previous = { start, reportedAt, approximateBytes, observed };
        return Object.freeze({
          kind: 'approximate-account-ingest',
          accountId,
          scope: 'account',
          billingMonthUtc: since.slice(0, 7),
          approximateBytes,
          sourceReportedAt: new Date(reportedAt).toISOString(),
          observedAt: new Date(observed).toISOString(),
          generationAgeMs: observed - reportedAt,
          querySha256: createHash('sha256').update(nrql).digest('hex'),
          ingestUpperBound: false,
        });
      } catch {
        return refuse();
      } finally {
        clearTimeout(timer);
        controller.abort();
        if (forwardAbort) signal?.removeEventListener('abort', forwardAbort);
        busy = false;
      }
    },
  });
}
