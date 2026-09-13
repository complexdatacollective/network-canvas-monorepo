import { expect, it } from 'vitest';

import { registryRequestMethod, registryRequestRoute } from './routes.ts';

const CANARY = 'participant@example.test-secret-template-id';

it('maps request paths and methods to finite labels without retaining identities', () => {
  const routes = [
    ['/healthz', '/healthz'],
    ['/metrics', '/metrics'],
    [`/account/${CANARY}`, '/account/*'],
    [`/api/auth/${CANARY}`, '/api/auth/*'],
    [`/api/v1/artifacts/${CANARY}`, '/api/v1/artifacts/:root'],
    [`/api/v1/entries/${CANARY}`, '/api/v1/entries/:id/*'],
    [`/api/v1/account/${CANARY}`, '/api/v1/account/*'],
    [`/api/v1/moderation/${CANARY}`, '/api/v1/moderation/*'],
    [`/api/${CANARY}`, 'unmatched'],
    [`/${CANARY}`, 'not_found'],
  ] as const;
  for (const [path, expected] of routes) {
    const route = registryRequestRoute(path);
    expect(route).toBe(expected);
    expect(route).not.toContain(CANARY);
  }
  expect(registryRequestMethod('GET')).toBe('GET');
  expect(registryRequestMethod(CANARY)).toBe('OTHER');
});
