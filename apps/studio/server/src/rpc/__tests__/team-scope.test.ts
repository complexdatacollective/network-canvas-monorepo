import { Cause, Effect, Exit, Option } from 'effect';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { AuthServiceStub } from '../../__tests__/support/auth.ts';
import type { AuthService } from '../../auth/service.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
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

/** An auth service whose only answer is which teams this caller is in. */
const authFor = (memberOf: Record<string, string>) =>
  AuthServiceStub({
    getMembership: (_userId, teamId) =>
      Effect.succeed(
        Option.fromNullishOr(memberOf[teamId]).pipe(
          Option.map((role) => ({ role })),
        ),
      ),
  });

/**
 * A limiter that admits everything and writes down what it was asked, so a case
 * can assert which windows are charged and when — the team's only once
 * membership is proved.
 */
const recordingLimiter = (
  charged: Array<`${RateLimitScope}:${string}`>,
): RateLimiter['Service'] => ({
  configured: true,
  rules: RATE_LIMITS,
  check: (scope, subject) =>
    Effect.sync(() => {
      charged.push(`${scope}:${subject}`);
      return { allowed: true };
    }),
  consume: () => Effect.succeed({ allowed: true }),
  readiness: Effect.succeed('ok'),
});

const DEPS: RpcDeps = {
  pool: unusedPool,
  capabilities: {
    enabled: true,
    magicLink: true,
    emailAndPassword: false,
    socialProviders: [],
  },
  deployment: { mode: 'self-hosted', billing: false },
  readInstallation: () => Promise.resolve(null),
};

const attempt = <A, E>(
  effect: Effect.Effect<A, E, Principal | AuthService | RateLimiter>,
  memberOf: Record<string, string>,
  charged: Array<`${RateLimitScope}:${string}`> = [],
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provideService(Principal, PRINCIPAL),
      Effect.provideService(RateLimiter, recordingLimiter(charged)),
      Effect.provide(authFor(memberOf)),
    ),
  );

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
    const memberOf = { 'team-mine': 'owner' };

    // The first team exists and belongs to someone else; the second does not
    // exist at all. The stub answers none to both, which is the only thing
    // `getMembership` can say — and that is the design: the membership lookup
    // is the only question asked, so there is nothing else for a refusal to be
    // built out of.
    const notAMember = refusalOf(
      await attempt(openTeam(DEPS, PRINCIPAL, 'team-theirs'), memberOf),
    );
    const noSuchTeam = refusalOf(
      await attempt(openTeam(DEPS, PRINCIPAL, 'team-nowhere'), memberOf),
    );

    // Byte-identical, not merely both `Forbidden`: serialised, the two answers
    // are the same string, so nothing a caller can read tells "exists, not
    // yours" from "does not exist".
    expect(JSON.stringify(notAMember)).toEqual(JSON.stringify(noSuchTeam));
    expect(notAMember).toEqual(FORBIDDEN);
  });

  it('charges the team only after membership, and never the caller', async () => {
    const charged: Array<`${RateLimitScope}:${string}`> = [];
    const memberOf = { 'team-mine': 'owner' };

    // A team the caller is not in: nothing is spent here. Charging the team
    // first would let any signed-in stranger who can guess a team id exhaust
    // that team's quota with refused calls. The caller's own window is not
    // this helper's any more: `Authenticated` charged it before the handler
    // ran (`__tests__/auth.test.ts` proves that order), so a charge here
    // would count every team call twice.
    await attempt(openTeam(DEPS, PRINCIPAL, 'team-nowhere'), memberOf, charged);
    expect(charged).toEqual([]);

    // A team they are in: the team's window, and only then.
    await attempt(openTeam(DEPS, PRINCIPAL, 'team-mine'), memberOf, charged);
    expect(charged).toEqual(['rpc_team:team-mine']);
  });

  it('mints an access carrying the team and the membership role', async () => {
    // The positive control. Without it the case above would also pass for an
    // `openTeam` that refused everything.
    const exit = await attempt(openTeam(DEPS, PRINCIPAL, 'team-mine'), {
      'team-mine': 'admin',
    });

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
    const exit = await attempt(
      Effect.flatMap(openTeam(DEPS, PRINCIPAL, 'team-mine'), (access) =>
        requireTeamAdministration(access),
      ),
      { 'team-mine': role },
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
