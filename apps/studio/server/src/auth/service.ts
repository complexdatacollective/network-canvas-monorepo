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
  /**
   * The team this session last worked in, or null before one is chosen. Read
   * from the session row the cookie already resolved, so it costs nothing;
   * it orders the study shell's tenancy probe (design §6.3) and is what §6.6's
   * reconciler compares the committed team against.
   */
  activeTeamId: string | null;
};

export type Principal = SessionPrincipal;

/**
 * A user's standing in the team they were resolved against. Roles are the
 * organization plugin's ('owner' | 'admin' | 'member' by default); #1257's
 * RBAC taxonomy maps onto them later. Read-only request authorization stays
 * behind AuthService so better-auth remains replaceable (#1245); audited team
 * commands re-read and lock the same domain rows through TeamStore because
 * their authorization decision must share the write transaction.
 */
export type TeamMembership = {
  role: string;
};

export type AuthService = {
  handler(request: Request): Promise<Response>;
  /** Cookie-session lookup; null when absent, expired, or auth is disabled. */
  getSession(headers: Headers): Promise<SessionPrincipal | null>;
  /** Null when the user is not a member of the team (or auth is disabled). */
  getMembership(userId: string, teamId: string): Promise<TeamMembership | null>;
  /**
   * The ids of the teams this user belongs to, ascending. The study shell
   * resolves a study with no teamId in its input by probing exactly these
   * teams (design §6.3), and the rule that resolution holds is that nothing
   * else is read before a TenantDb is pinned — so this deliberately returns
   * ids and not roles, names, or counts. Empty when the user is in no team
   * (or auth is disabled).
   */
  listMemberTeamIds(userId: string): Promise<string[]>;
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
    listMemberTeamIds: () => Promise.resolve([]),
  };
}
