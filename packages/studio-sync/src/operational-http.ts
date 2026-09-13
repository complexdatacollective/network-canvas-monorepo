import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ServerResponse } from 'node:http';

export type RequestObservation = {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
};

export const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const methods = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'CONNECT',
  'TRACE',
]);

export function boundedRequestMethod(method: string): string {
  return methods.has(method) ? method : 'OTHER';
}

export function selectRequestId(
  supplied: string | undefined,
  trustedTransportPeer: boolean,
): string {
  return supplied && trustedTransportPeer && REQUEST_ID.test(supplied)
    ? supplied.toLowerCase()
    : randomUUID();
}

export function requestLogFields(observation: RequestObservation) {
  return {
    ...(REQUEST_ID.test(observation.requestId)
      ? { request_id: observation.requestId.toLowerCase() }
      : {}),
    route: observation.route,
    method: observation.method,
    status: observation.status,
    duration_ms: Math.round(observation.durationMs * 1_000) / 1_000,
  };
}

export function createRequestCompletion(options: {
  requestId: string;
  route: string;
  method: string;
  startedAt?: number;
  record(observation: RequestObservation): void;
}) {
  const startedAt = options.startedAt ?? performance.now();
  let completed = false;
  return (status: number) => {
    if (completed) return;
    completed = true;
    options.record({
      requestId: options.requestId,
      route: options.route,
      method: options.method,
      status,
      durationMs: Math.max(0, performance.now() - startedAt),
    });
  };
}

/** Observe the actual Node response once, including a cancelled transport. */
export function observeNodeResponse(
  outgoing: ServerResponse,
  complete: (status: number) => void,
): void {
  outgoing.once('finish', () => complete(outgoing.statusCode));
  outgoing.once('close', () =>
    complete(outgoing.writableFinished ? outgoing.statusCode : 499),
  );
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function authorizeBearerToken(
  header: string | undefined,
  token: string,
): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}
