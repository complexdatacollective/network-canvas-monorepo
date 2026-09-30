// `openSession` and `HostSessionLive`: who may reach a protocol through the
// protocol-builder host, and what it costs them. Driven through the handlers
// in process, so each case is the gate a real call meets — the middleware,
// the budget checks and the membership probe — with nothing but the transport
// taken away.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, Context, Effect, Exit, Option } from 'effect';
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
  email: 'pb-session@example.com',
  emailVerified: true,
  name: 'Session Researcher',
  locale: null,
  sessionId: 'pb-session-cookie-session',
};

/** A member who can see only the protocols of studies they hold a grant on. */
const MEMBER: SessionPrincipal = {
  ...RESEARCHER,
  userId: 'pb-session-member',
  email: 'pb-session-member@example.com',
  name: 'Session Member',
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
  /** What the gate did, in order: budget charges and membership reads. */
  const steps: string[] = [];
  /** Scopes the recording limiter refuses. */
  const spent = new Set<string>();
  /** The role `listMemberships` answers for `MEMBER`, whatever the row says. */
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
          [who.userId, who.name, who.email],
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
        // The session a request's cookie resolves to: only the researcher's.
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
      pool: database.appPool,
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
    // No cookie a session resolves to.
    // Mutation: let `HostSessionLive` call the handler without a principal →
    // the call dies in `openSession` instead of failing with this tag.
    await expectRpcFailure(
      listAs({ headers: { cookie: 'session=stranger' } }, reachable),
      'HostUnauthorized',
    );
    // Refused before anything was charged or read.
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
    // The same answer field for field, so neither tells the caller which it
    // was.
    expect({ ...foreign, protocolId: '' }).toEqual({
      ...missing,
      protocolId: '',
    });
    expect(Object.keys(foreign).sort()).toEqual(Object.keys(missing).sort());
  });

  it('answers a reachable protocol with nothing open to edit as not found', async () => {
    // Mutation: fail a reachable protocol with no draft as `SectionNotFound`
    // (or anything but `ProtocolNotFound`) → this names the wrong tag.
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
    // Mutation: charge `rpc_team` before the memberships are read → the
    // order below changes.
    expect(steps).toEqual([
      `rpc_user:${RESEARCHER.userId}`,
      `memberships:${RESEARCHER.userId}`,
      `rpc_team:${OWN_TEAM}`,
    ]);

    // A protocol the caller cannot reach charges no team at all.
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
      // Not one of the group's declared errors: `RateLimited` is not on the
      // contract (#1927 §20 Q11), so it is a defect the client cannot name.
      expect(Option.isNone(Cause.findErrorOption(exit.cause))).toBe(true);
      expect(steps).toEqual([`rpc_user:${RESEARCHER.userId}`]);
    } finally {
      spent.delete('rpc_user');
    }
  });

  it('decides a write on the role locked in its transaction, not the one the session read', async () => {
    // The member holds no grant on the study behind this protocol, so it is
    // not theirs to edit — but `listMemberships` answers `owner`, the role
    // they held a moment ago, and the session gate believes it.
    staleRoles.set(MEMBER.userId, 'owner');
    try {
      const sections = await client.call(
        { principal: MEMBER },
        client.rpc('ListSections', { protocolId: reachable }),
      );
      expect(sections.sectionIds).toContain('stageOrder');
      // Mutation: drop `requireProtocol` from `acquireLock` → the lease is
      // taken on the stale role.
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
