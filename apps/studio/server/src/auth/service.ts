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

/** A membership that names its team: what a study's tenant is resolved over. */
export type IdentifiedTeamMembership = TeamMembership & {
  teamId: string;
};

export type AuthService = {
  handler(request: Request): Promise<Response>;
  /** Cookie-session lookup; null when absent, expired, or auth is disabled. */
  getSession(headers: Headers): Promise<SessionPrincipal | null>;
  /** Null when the user is not a member of the team (or auth is disabled). */
  getMembership(userId: string, teamId: string): Promise<TeamMembership | null>;
  /**
   * Every team the user belongs to. The search space a study identifier is
   * resolved over (app-shell design §6.3): a `/study/$studyId` URL names no
   * team, so the server derives it rather than trusting one from the browser.
   * Empty when the user belongs to nothing, or auth is disabled.
   */
  listMemberships(userId: string): Promise<IdentifiedTeamMembership[]>;
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
    listMemberships: () => Promise.resolve([]),
  };
}
