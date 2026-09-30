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
  /**
   * The stored UI-language preference (user.locale, localization design
   * §5.2); null until the researcher chooses one. On the principal because
   * the session lookup already reads the user row, so `me` forwards it
   * without a query of its own — and stays answerable database-free.
   */
  locale: string | null;
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

/**
 * A session the auth provider has just established for a caller who had none.
 *
 * `headers` are the provider's own response headers, `set-cookie` included:
 * the browser is signed in by carrying them out through the surface that asked
 * (oRPC's ResponseHeadersPlugin, wired in src/app.ts), rather than by any
 * cookie this application knows how to spell.
 */
export type EstablishedSession = {
  userId: string;
  headers: Headers;
};

export type SignUpOutcome =
  | { kind: 'created'; session: EstablishedSession }
  /** The address already has an account; nothing was created. */
  | { kind: 'emailTaken' }
  /** Auth is not configured, so no account can exist. */
  | { kind: 'unavailable' };

export type SignInOutcome =
  | { kind: 'signedIn'; session: EstablishedSession }
  /** Wrong credentials, no such account, or auth is not configured. */
  | { kind: 'refused' };

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
  /**
   * Creates an email/password account and signs it in, returning the headers
   * that carry the session.
   *
   * Here for first-run bootstrap alone (#1909): every other account arrives
   * through the provider's own endpoints under `/api/auth/*`, which the
   * browser talks to directly. `/setup` cannot, because the account it creates
   * and the ownership mark it writes have to be one procedure.
   */
  signUpEmail(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<SignUpOutcome>;
  /**
   * Signs an existing account in, for the one case `/setup` has to recover
   * from: an account created by an interrupted setup, whose ownership mark
   * never landed. Proving the password is what makes adopting it safe.
   */
  signInEmail(input: {
    email: string;
    password: string;
  }): Promise<SignInOutcome>;
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
    signUpEmail: () => Promise.resolve({ kind: 'unavailable' }),
    signInEmail: () => Promise.resolve({ kind: 'refused' }),
  };
}
