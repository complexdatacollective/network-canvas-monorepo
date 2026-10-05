import { Cause, Effect, Exit, Layer, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { AuthServiceStub } from '../../__tests__/support/auth.ts';
import { absentDataServices } from '../../__tests__/support/services.ts';
import type { AuthService } from '../../auth/service.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { RATE_LIMITS, type RateLimitScope } from '../../rate-limit/scopes.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam, requireTeamAdministration } from '../team-scope.ts';

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

const unusedServices = Effect.runSync(
  Effect.scoped(Layer.build(absentDataServices)),
);

const authFor = (memberOf: Record<string, string>) =>
  AuthServiceStub({
    getMembership: (_userId, teamId) =>
      Effect.succeed(
        Option.fromNullishOr(memberOf[teamId]).pipe(
          Option.map((role) => ({ role })),
        ),
      ),
  });

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
  capabilities: {
    enabled: true,
    magicLink: true,
    emailAndPassword: false,
    socialProviders: [],
  },
  deployment: { mode: 'self-hosted', billing: false },
  readInstallation: () => Promise.resolve(null),
  services: unusedServices,
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

    const notAMember = refusalOf(
      await attempt(openTeam(DEPS, PRINCIPAL, 'team-theirs'), memberOf),
    );
    const noSuchTeam = refusalOf(
      await attempt(openTeam(DEPS, PRINCIPAL, 'team-nowhere'), memberOf),
    );

    expect(JSON.stringify(notAMember)).toEqual(JSON.stringify(noSuchTeam));
    expect(notAMember).toEqual(FORBIDDEN);
  });

  it('charges the team only after membership, and never the caller', async () => {
    const charged: Array<`${RateLimitScope}:${string}`> = [];
    const memberOf = { 'team-mine': 'owner' };

    await attempt(openTeam(DEPS, PRINCIPAL, 'team-nowhere'), memberOf, charged);
    expect(charged).toEqual([]);

    await attempt(openTeam(DEPS, PRINCIPAL, 'team-mine'), memberOf, charged);
    expect(charged).toEqual(['rpc_team:team-mine']);
  });

  it('mints an access carrying the team and the membership role', async () => {
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
      expect(refusalOf(exit)).toEqual(FORBIDDEN);
    }
  });
});
