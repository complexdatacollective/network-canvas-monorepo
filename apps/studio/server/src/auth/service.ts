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

/**
 * A user's standing in the workspace they were resolved against. Roles are
 * the organization plugin's ('owner' | 'admin' | 'member' by default);
 * #1257's RBAC taxonomy maps onto them later. Kept behind AuthService so
 * better-auth stays replaceable (#1245) — no other module may read the
 * membership tables.
 */
export type WorkspaceMembership = {
  role: string;
};

export type AuthService = {
  handler(request: Request): Promise<Response>;
  /** Cookie-session lookup; null when absent, expired, or auth is disabled. */
  getSession(headers: Headers): Promise<SessionPrincipal | null>;
  /** Null when the user is not a member of the workspace (or auth is disabled). */
  getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
};

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
    getMembership: () => Promise.resolve(null),
  };
}
