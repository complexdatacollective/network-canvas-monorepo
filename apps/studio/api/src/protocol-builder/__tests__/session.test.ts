import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, Context, Effect, Exit, Option, Redacted } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { sectionId as makeSectionId } from '@codaco/studio-sync/taxonomy';

import { authServiceStub } from '../../__tests__/support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  type TestDatabaseRuntime,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  createProtocolBuilderClient,
  type ProtocolBuilderTestClient,
} from '../../__tests__/support/protocol-builder.ts';
import { expectRpcFailure } from '../../__tests__/support/rpc.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { limiterWithoutStore } from '../../__tests__/support/valkey.ts';
import { createStudio } from '../../app.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { resolve as resolveEnv } from '../../env/resolve.ts';
import {
  createProtocol,
  discardDraft,
  latestDraftId,
} from '../../protocol/store.ts';
import type { RateLimiter } from '../../rate-limit/limiter.ts';
import { SecretsCipher } from '../../secrets/services.ts';

const OWN_TEAM = 'pb-session-team';

const STAGE_ORDER = makeSectionId({ kind: 'stageOrder' });
const OTHER_TEAM = 'pb-session-other-team';

const RESEARCHER: SessionPrincipal = {
  kind: 'user',
  userId: 'pb-session-user',
  email: Redacted.make('pb-session@example.com'),
  emailVerified: true,
  name: Redacted.make('Session Researcher'),
  locale: null,
  sessionId: 'pb-session-cookie-session',
};

const MEMBER: SessionPrincipal = {
  ...RESEARCHER,
  userId: 'pb-session-member',
  email: Redacted.make('pb-session-member@example.com'),
  name: Redacted.make('Session Member'),
  sessionId: 'pb-session-member-session',
};

const readSample = (): CurrentProtocol =>
  JSON.parse(
    readFileSync(
      fileURLToPath(import.meta.resolve('@codaco/protocols/sample')),
      'utf8',
    ),
  ) as CurrentProtocol;

describe.skipIf(!testDb)('opening a protocol-builder session', () => {
  let database: TestDatabaseRuntime;
  let reachable: string;
  let elsewhere: string;
  let nothingOpen: string;
  const steps: string[] = [];
  const spent = new Set<string>();
  const staleRoles = new Map<string, 'owner' | 'member'>();
  let client: ProtocolBuilderTestClient;

  const recordingLimiter: RateLimiter['Service'] = {
    ...limiterWithoutStore,
    check: (scope, subject) =>
      Effect.flatMap(
        Effect.sync(() => steps.push(`${scope}:${subject}`)),
        () =>
          spent.has(scope)
            ? Effect.succeed({ allowed: false, retryAfterSeconds: 30 })
            : limiterWithoutStore.check(scope, subject),
      ),
  };

  const createIn = async (teamId: string, name: string) => {
    const services = Context.add(
      database.services,
      SecretsCipher,
      testCipher(),
    );
    return Effect.runPromiseWith(services)(
      TenantScope.open(
        unsafeMakeTeamAccess(teamId, 'owner'),
        createProtocol(teamId, testCipher(), {
          protocol: { ...readSample(), name },
        }),
      ),
    );
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    for (const team of [OWN_TEAM, OTHER_TEAM]) {
      await database.run(insertTeam(team));
    }
    for (const [who, role] of [
      [RESEARCHER, 'owner'],
      [MEMBER, 'member'],
    ] as const) {
      await database.run(
        ownerAffected(
          `INSERT INTO "user" (id, name, email, "emailVerified")
           VALUES ($1, $2, $3, true)`,
          [who.userId, Redacted.value(who.name), Redacted.value(who.email)],
        ),
      );
      await database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, $4)`,
          [`${who.userId}-membership`, OWN_TEAM, who.userId, role],
        ),
      );
    }
    reachable = (await createIn(OWN_TEAM, 'Reachable')).protocolId;
    elsewhere = (await createIn(OTHER_TEAM, 'Another team’s')).protocolId;
    nothingOpen = (await createIn(OWN_TEAM, 'Nothing open')).protocolId;
    const services = Context.add(
      database.services,
      SecretsCipher,
      testCipher(),
    );
    await Effect.runPromiseWith(services)(
      TenantScope.open(
        unsafeMakeTeamAccess(OWN_TEAM, 'owner'),
        Effect.gen(function* () {
          const draftId = yield* latestDraftId(OWN_TEAM, nothingOpen);
          if (draftId === undefined) {
            return yield* Effect.die(new Error('the protocol has no draft'));
          }
          yield* discardDraft(OWN_TEAM, draftId);
        }),
      ),
    );

    const studio = createStudio(resolveEnv({ NODE_ENV: 'test' }), {
      auth: authServiceStub({
        getSession: (headers) =>
          Effect.succeed(
            headers.cookie === 'session=researcher'
              ? Option.some(RESEARCHER)
              : Option.none(),
          ),
        listMemberships: (userId) =>
          Effect.sync(() => {
            steps.push(`memberships:${userId}`);
            if (userId === MEMBER.userId) {
              return [
                {
                  teamId: OWN_TEAM,
                  role: staleRoles.get(userId) ?? 'member',
                },
              ];
            }
            return [{ teamId: OWN_TEAM, role: 'owner' }];
          }),
      }),
      limiter: recordingLimiter,
      services: Context.add(database.services, SecretsCipher, testCipher()),
    });
    client = await createProtocolBuilderClient(studio);
  });

  afterAll(async () => {
    await client?.dispose();
    await database?.dispose();
  });

  const listAs = (
    caller: Parameters<ProtocolBuilderTestClient['callExit']>[0],
    protocolId: string,
  ) => client.callExit(caller, client.rpc('ListSections', { protocolId }));

  it('refuses a caller with no principal as HostUnauthorized', async () => {
    steps.length = 0;
    await expectRpcFailure(
      listAs({ headers: { cookie: 'session=stranger' } }, reachable),
      'HostUnauthorized',
    );
    expect(steps).toEqual([]);
  });

  it('admits a caller the request headers resolve, with no principal given', async () => {
    const listed = await client.call(
      { headers: { cookie: 'session=researcher' } },
      client.rpc('ListSections', { protocolId: reachable }),
    );
    expect(listed.sectionIds).toContain('stageOrder');
  });

  it('answers another team’s protocol and a missing one with the same refusal', async () => {
    const foreign = await expectRpcFailure(
      listAs({ principal: RESEARCHER }, elsewhere),
      'ProtocolNotFound',
    );
    const missing = await expectRpcFailure(
      listAs({ principal: RESEARCHER }, randomUUID()),
      'ProtocolNotFound',
    );
    expect({ ...foreign, protocolId: '' }).toEqual({
      ...missing,
      protocolId: '',
    });
    expect(Object.keys(foreign).sort()).toEqual(Object.keys(missing).sort());
  });

  it('answers a reachable protocol with nothing open to edit as not found', async () => {
    await expectRpcFailure(
      listAs({ principal: RESEARCHER }, nothingOpen),
      'ProtocolNotFound',
    );
  });

  it('charges the caller before any query, and the team only once it is known', async () => {
    steps.length = 0;
    await client.call(
      { principal: RESEARCHER },
      client.rpc('ListSections', { protocolId: reachable }),
    );
    expect(steps).toEqual([
      `rpc_user:${RESEARCHER.userId}`,
      `memberships:${RESEARCHER.userId}`,
      `rpc_team:${OWN_TEAM}`,
    ]);

    steps.length = 0;
    await expectRpcFailure(
      listAs({ principal: RESEARCHER }, elsewhere),
      'ProtocolNotFound',
    );
    expect(steps).toEqual([
      `rpc_user:${RESEARCHER.userId}`,
      `memberships:${RESEARCHER.userId}`,
    ]);
  });

  it('refuses a spent caller before reading anything, as a failure the contract does not name', async () => {
    steps.length = 0;
    spent.add('rpc_user');
    try {
      const exit = await listAs({ principal: RESEARCHER }, reachable);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isSuccess(exit)) return;
      // `RateLimited` is not on the contract, so it is a defect.
      expect(Option.isNone(Cause.findErrorOption(exit.cause))).toBe(true);
      expect(steps).toEqual([`rpc_user:${RESEARCHER.userId}`]);
    } finally {
      spent.delete('rpc_user');
    }
  });

  it('decides a read and a write on the role locked in its transaction, not the one the session read', async () => {
    staleRoles.set(MEMBER.userId, 'owner');
    try {
      await expectRpcFailure(
        client.callExit(
          { principal: MEMBER },
          client.rpc('ListSections', { protocolId: reachable }),
        ),
        'ProtocolNotFound',
      );
      await expectRpcFailure(
        client.callExit(
          { principal: MEMBER },
          client.rpc('AcquireLock', {
            protocolId: reachable,
            sectionId: STAGE_ORDER,
          }),
        ),
        'ProtocolNotFound',
      );
    } finally {
      staleRoles.delete(MEMBER.userId);
    }
  });
});
