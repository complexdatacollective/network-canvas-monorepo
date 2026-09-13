import { expect, it, vi } from 'vitest';

import {
  authorizeBearerToken,
  boundedRequestMethod,
  createRequestCompletion,
  requestLogFields,
  selectRequestId,
} from '../operational-http.ts';

it('records one bounded completion and omits malformed request identities', () => {
  const record = vi.fn();
  const complete = createRequestCompletion({
    requestId: 'untrusted\nidentity',
    route: 'not_found',
    method: boundedRequestMethod('invented'),
    startedAt: performance.now() - 5,
    record,
  });
  complete(499);
  complete(200);
  expect(record).toHaveBeenCalledTimes(1);
  expect(requestLogFields(record.mock.calls[0]![0])).toEqual({
    route: 'not_found',
    method: 'OTHER',
    status: 499,
    duration_ms: expect.any(Number),
  });
});

it('accepts only the exact bearer credential', () => {
  const token = 'private-metrics-token';
  expect(authorizeBearerToken(`Bearer ${token}`, token)).toBe(true);
  for (const header of [
    undefined,
    token,
    `Basic ${token}`,
    `Bearer ${token} extra`,
    `Bearer ${token}\n`,
  ])
    expect(authorizeBearerToken(header, token)).toBe(false);
});

it('accepts a valid supplied id only after transport trust is proved', () => {
  const supplied = 'CB6DC2C0-DF78-4FD2-9131-7FF2909C88E5';
  expect(selectRequestId(supplied, true)).toBe(supplied.toLowerCase());
  expect(selectRequestId(supplied, false)).not.toBe(supplied.toLowerCase());
  expect(selectRequestId('invalid', true)).not.toBe('invalid');
});
