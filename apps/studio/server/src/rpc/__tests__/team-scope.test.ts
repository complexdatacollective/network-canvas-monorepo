import { Cause, Effect, Exit } from 'effect';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import type { AuthService } from '../../auth/service.ts';
import type { RateLimiter } from '../../rate-limit.ts';
import { RATE_LIMITS, type RateLimitScope } from '../../rate-limit/scopes.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam, requireTeamAdministration } from '../team-scope.ts';

// Where a `TeamAccess` comes from, and what it refuses with (#1927 §10).
//
// These drive `openTeam` directly rather than through a procedure: what is
// under test is the refusal itself — that two different reasons produce one
// indistinguishable answer — and a procedure would wrap it in a transport that
// could hide a difference the caller can actually see.

/**
 * Every own property of a `Forbidden`, which is the whole of what a refused
 * caller can read. It carries no reason beyond `detail`, and neither branch
 * sets one — the point of writing the fields out is that a branch which started
 * setting `detail` would fail here rather than quietly become an oracle.
 */
const FORBIDDEN = {
  tag: 'Forbidden',
  own: {
    _tag: 'Forbidden',
    status: 403,
    title: 'Forbidden',
    type: 'about:blank',
  },
};

const PRINCIPAL = Principal.of({
  kind: 'user',
  userId: UserId.make('researcher'),
  email: 'researcher@example.org',
  emailVerified: true,
  name: 'A Researcher',
  locale: null,
  sessionId: 'session-researcher',
});

/**
 * A pool object that is never connected to. `openTeam` asserts one exists
 * before it looks a membership up — a plane wired without a database is a
 * deployment bug — and nothing here gets far enough to use it.
 */
const unusedPool = {} as unknown as pg.Pool;

/**
 * The auth service as an object rather than through `support/auth.ts`, whose
 * `stubAuthService` pulls `app.ts` and the whole protocol-builder host in with
 * it. Nothing here needs any of that, and this file has to keep running while
 * those modules are mid-conversion.
 */
const authFor = (memberOf: Record<string, string>): AuthService => ({
  handler: () => Promise.resolve(Response.json({})),
  getSession: () => Promise.resolve(null),
  getMembership: (_userId, teamId) => {
    const role = memberOf[teamId];
    return Promise.resolve(role === undefined ? null : { role });
  },
  listMemberships: () => Promise.resolve([]),
  signUpEmail: () => Promise.resolve({ kind: 'unavailable' }),
  signInEmail: () => Promise.resolve({ kind: 'refused' }),
});

/**
 * A limiter that admits everything and writes down what it was asked, so a case
 * can assert the ORDER the windows are charged in — the caller's before any
 * database work, the team's only once membership is proved.
 */
const recordingLimiter = (
  charged: Array<`${RateLimitScope}:${string}`>,
): RateLimiter => ({
  configured: true,
  rules: RATE_LIMITS,
  check: (scope, subject) => {
    charged.push(`${scope}:${subject}`);
    return Promise.resolve({ allowed: true });
  },
  consume: () => Promise.resolve({ allowed: true }),
  readiness: () => Promise.resolve('ok'),
});

const depsFor = (
  memberOf: Record<string, string>,
  limiter?: RateLimiter,
): RpcDeps => ({
  pool: unusedPool,
  auth: authFor(memberOf),
  ...(limiter === undefined ? {} : { limiter }),
  capabilities: {
    enabled: true,
    magicLink: true,
    emailAndPassword: false,
    socialProviders: [],
  },
  deployment: { mode: 'self-hosted', billing: false },
  readInstallation: () => Promise.resolve(null),
});

const attempt = <A, E>(effect: Effect.Effect<A, E, Principal>) =>
  Effect.runPromiseExit(Effect.provideService(effect, Principal, PRINCIPAL));

/**
 * The refusal as a caller can read it: the tag and every own property of the
 * error value. Comparing the two whole values is the point — a field added to
 * `Forbidden` later that one branch fills in and the other does not would
 * become an oracle, and this is what would catch it.
 */
const refusalOf = (exit: Exit.Exit<unknown, unknown>): unknown => {
  if (Exit.isSuccess(exit)) {
    expect.unreachable('expected a refusal, but the call succeeded');
  }
  const error = Cause.findErrorOption(exit.cause);
  if (error._tag === 'None') {
    expect.unreachable(
      `expected a refusal, but the call died: ${Cause.pretty(exit.cause)}`,
    );
  }
  const value = error.value;
  if (typeof value !== 'object' || value === null) return value;
  return {
    tag: Reflect.get(value, '_tag'),
    own: Object.fromEntries(
      Object.entries(value).toSorted(([left], [right]) =>
        left < right ? -1 : 1,
      ),
    ),
  };
};

describe('openTeam', () => {
  it('refuses a team the caller is not in and a team that does not exist identically', async () => {
    const deps = depsFor({ 'team-mine': 'owner' });

    // The first team exists and belongs to someone else; the second does not
    // exist at all. The stub answers `null` to both, which is the only thing
    // `getMembership` can say — and that is the design: the membership lookup
    // is the only question asked, so there is nothing else for a refusal to be
    // built out of.
    const notAMember = refusalOf(
      await attempt(openTeam(deps, PRINCIPAL, 'team-theirs')),
    );
    const noSuchTeam = refusalOf(
      await attempt(openTeam(deps, PRINCIPAL, 'team-nowhere')),
    );

    // Byte-identical, not merely both `Forbidden`: serialised, the two answers
    // are the same string, so nothing a caller can read tells "exists, not
    // yours" from "does not exist".
    expect(JSON.stringify(notAMember)).toEqual(JSON.stringify(noSuchTeam));
    expect(notAMember).toEqual(FORBIDDEN);
  });

  it('charges the caller before any database work and the team only after membership', async () => {
    const charged: Array<`${RateLimitScope}:${string}`> = [];
    const deps = depsFor({ 'team-mine': 'owner' }, recordingLimiter(charged));

    // A team the caller is not in: the caller's own window is spent, the
    // team's is not. Charging the team first would let any signed-in stranger
    // who can guess a team id exhaust that team's quota with refused calls.
    await attempt(openTeam(deps, PRINCIPAL, 'team-nowhere'));
    expect(charged).toEqual(['rpc_user:researcher']);

    // A team they are in: the team's window follows, and only then.
    charged.length = 0;
    await attempt(openTeam(deps, PRINCIPAL, 'team-mine'));
    expect(charged).toEqual(['rpc_user:researcher', 'rpc_team:team-mine']);
  });

  it('mints an access carrying the team and the membership role', async () => {
    // The positive control. Without it the case above would also pass for an
    // `openTeam` that refused everything.
    const deps = depsFor({ 'team-mine': 'admin' });
    const exit = await attempt(openTeam(deps, PRINCIPAL, 'team-mine'));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.teamId).toBe('team-mine');
    expect(exit.value.role).toBe('admin');
  });
});

describe('requireTeamAdministration', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    // A role list this build cannot parse is not an administrator: the safe
    // reading of a value it does not understand is the narrower one.
    ['not-a-role', false],
  ])('admits %s: %s', async (role, admitted) => {
    const deps = depsFor({ 'team-mine': role });
    const exit = await attempt(
      Effect.flatMap(openTeam(deps, PRINCIPAL, 'team-mine'), (access) =>
        requireTeamAdministration(access),
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(admitted);
    if (!admitted) {
      // The tier refusal is the same `Forbidden` as the membership one, so a
      // Member cannot tell "you are not in this team" from "you are, but not an
      // administrator" either.
      expect(refusalOf(exit)).toEqual(FORBIDDEN);
    }
  });
});
