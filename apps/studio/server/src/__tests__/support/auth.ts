import type { AuthService } from '../../auth/service.ts';

/**
 * An AuthService double that answers every method with its null case; tests
 * state only what they override. Growing the AuthService interface then
 * touches this file, not every test that stubs it.
 */
export function stubAuthService(overrides?: Partial<AuthService>): AuthService {
  return {
    handler: () => Promise.resolve(Response.json({})),
    getSession: () => Promise.resolve(null),
    getMembership: () => Promise.resolve(null),
    ...overrides,
  };
}
