// The auth seam (#1245): downstream code depends on these types and nothing
// from the underlying library, so the library is replaceable behind this
// interface. Only src/auth/better-auth.ts imports 'better-auth'.

/**
 * A researcher signed in with a cookie session. The `kind` discriminant
 * reserves the slot for the token plane's ServicePrincipal (#1288).
 */
export type SessionPrincipal = {
  kind: 'user';
  userId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  sessionId: string;
};

export type Principal = SessionPrincipal;

export type AuthService = {
  /** Serves `/api/auth/*` (WHATWG Request/Response). */
  handler(request: Request): Promise<Response>;
  /** Cookie-session lookup; null when absent, expired, or auth is disabled. */
  getSession(headers: Headers): Promise<SessionPrincipal | null>;
};

/**
 * The degradation contract when no database is configured: the server boots,
 * auth surfaces refuse — mirroring the asset routes' 503 behaviour.
 */
export function createDisabledAuthService(): AuthService {
  return {
    handler: () =>
      Promise.resolve(
        Response.json(
          { title: 'Authentication Not Configured', status: 503 },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    getSession: () => Promise.resolve(null),
  };
}
