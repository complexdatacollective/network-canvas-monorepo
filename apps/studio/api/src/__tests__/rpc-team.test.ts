import { randomUUID } from 'node:crypto';

import { Effect, Option, Redacted } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { resolve } from '../env/resolve.ts';
import { NEW_PROTOCOL_FINISH_STAGE_ID } from '../protocol/sectionize.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import {
  openRateLimitStore,
  reachableRedis,
  REDIS_DATABASES,
} from './support/valkey.ts';

const redis = await reachableRedis(REDIS_DATABASES.rpcPlane);

const TEAM_A = TeamId.make('team-a');
const TEAM_B = TeamId.make('team-b');
const protocolId = () => ProtocolId.make(randomUUID());
const draftId = () => DraftId.make(randomUUID());

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'user-1',
  email: Redacted.make('researcher@example.com'),
  emailVerified: true,
  name: Redacted.make('Researcher'),
  locale: null,
  sessionId: 'session-1',
};

describe.skipIf(!testDb)('team-scoped procedures', () => {
  let database: TestDatabaseRuntime;
  let memberships: Record<string, { role: string }>;
  let client: RpcTestClient;
  let anonymousClient: RpcTestClient;

  beforeAll(async () => {
    database = await openTestDatabase();
    for (const teamId of ['team-a', 'team-b']) {
      await database.run(insertTeam(teamId));
    }
    await database.run(
      ownerAffected(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [
          PRINCIPAL.userId,
          Redacted.value(PRINCIPAL.name),
          Redacted.value(PRINCIPAL.email),
        ],
      ),
    );
    for (const teamId of ['team-a', 'team-b']) {
      await database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'admin')`,
          [`membership-${teamId}`, teamId, PRINCIPAL.userId],
        ),
      );
    }
    memberships = { 'team-a': { role: 'admin' } };
    const auth = authServiceStub({
      getSession: () => Effect.succeedSome(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Effect.succeed(Option.fromNullishOr(memberships[teamId])),
    });
    client = await createRpcClient(
      createStudio(readEnv(), {
        auth,
        services: database.services,
      }),
    );
    anonymousClient = await createRpcClient(
      createStudio(readEnv(), {
        auth: authServiceStub(),
        services: database.services,
      }),
    );
  });
  afterAll(async () => {
    await client.dispose();
    await anonymousClient.dispose();
    await database.dispose();
  });

  it('creates and lists protocols within a member team', async () => {
    const created = await client.call(
      client.rpc('protocols.create', {
        teamId: TEAM_A,
        name: Redacted.make('Spine Proof'),
        protocolId: protocolId(),
        draftId: draftId(),
      }),
    );
    const listed = await client.call(
      client.rpc('protocols.list', { teamId: TEAM_A }),
    );
    expect(listed.map((protocol) => protocol.id)).toContain(created.protocolId);
    const row = listed.find((protocol) => protocol.id === created.protocolId)!;
    expect(Redacted.value(row.name)).toBe('Spine Proof');
    expect(row.draftId).toBe(created.draftId);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('opens and structures an editor draft', async () => {
    const created = await client.call(
      client.rpc('protocols.create', {
        teamId: TEAM_A,
        name: Redacted.make('Editor proof'),
        protocolId: protocolId(),
        draftId: draftId(),
      }),
    );
    const scope = {
      teamId: TEAM_A,
      protocolId: created.protocolId,
      draftId: created.draftId,
    };
    const stageA = StageId.make('11111111-1111-4111-8111-111111111111');
    const stageB = StageId.make('22222222-2222-4222-8222-222222222222');
    await client.call(
      client.rpc('protocols.addInformationStage', {
        ...scope,
        stageId: stageA,
      }),
    );
    await client.call(
      client.rpc('protocols.addInformationStage', {
        ...scope,
        stageId: stageB,
      }),
    );
    const beforeMove = await client.call(client.rpc('protocols.draft', scope));
    await client.call(
      client.rpc('protocols.moveStage', {
        ...scope,
        stageId: stageB,
        toIndex: 0,
        expectedRevision: beforeMove.revision.sequence,
      }),
    );

    const opened = await client.call(client.rpc('protocols.draft', scope));
    // Both screens went in front of the finish stage a new protocol starts with.
    const openedOrder = opened.sections.stageOrder;
    expect(openedOrder && Redacted.value(openedOrder)).toEqual({
      stages: [stageB, stageA, NEW_PROTOCOL_FINISH_STAGE_ID],
    });
    const staleMove = await expectRpcFailure(
      client.callExit(
        client.rpc('protocols.moveStage', {
          ...scope,
          stageId: stageA,
          toIndex: 0,
          expectedRevision: beforeMove.revision.sequence,
        }),
      ),
      'Conflict',
    );
    expect(staleMove.reason).toBe('staleRevision');
  });

  it('refuses a non-member team and an unknown team identically', async () => {
    await expectRpcFailure(
      client.callExit(client.rpc('protocols.list', { teamId: TEAM_B })),
      'Forbidden',
    );
    await expectRpcFailure(
      client.callExit(
        client.rpc('protocols.list', { teamId: TeamId.make('team-none') }),
      ),
      'Forbidden',
    );
  });

  it('refuses without a session', async () => {
    await expectRpcFailure(
      anonymousClient.callExit(
        anonymousClient.rpc('protocols.list', { teamId: TEAM_A }),
      ),
      'Unauthorized',
    );
  });

  it.skipIf(!redis)(
    'refuses a caller who has spent their per-user budget, with the interval to wait',
    async () => {
      const userId = `budget-${randomUUID()}`;
      await database.run(
        ownerAffected(
          `INSERT INTO "user" (id, name, email, "emailVerified")
           VALUES ($1, $2, $3, true)`,
          [userId, Redacted.value(PRINCIPAL.name), `${userId}@example.com`],
        ),
      );
      await database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'admin')`,
          [`membership-${userId}`, TEAM_A, userId],
        ),
      );
      const limits = await openRateLimitStore(redis);
      const limited = await createRpcClient(
        createStudio(
          resolve({
            NODE_ENV: 'test',
            ...(redis ? { REDIS_URL: redis } : {}),
          }),
          {
            auth: authServiceStub({
              getSession: () =>
                Effect.succeedSome({
                  ...PRINCIPAL,
                  userId,
                  sessionId: `session-${userId}`,
                }),
              getMembership: () => Effect.succeedSome({ role: 'admin' }),
            }),
            services: database.services,
            limiter: limits.limiter({ rpc_user: { max: 2, windowMs: 60_000 } }),
          },
        ),
      );
      try {
        const list = () => limited.rpc('studies.list', { teamId: TEAM_A });
        await limited.call(list());
        await limited.call(list());

        const refused = await expectRpcFailure(
          limited.callExit(list()),
          'RateLimited',
        );
        expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      } finally {
        await limited.dispose();
        await limits.dispose();
      }
    },
  );

  it('scopes rows to the requested team even for a member of both', async () => {
    memberships['team-b'] = { role: 'admin' };
    const created = await client.call(
      client.rpc('protocols.create', {
        teamId: TEAM_A,
        name: Redacted.make('A-only protocol'),
        protocolId: protocolId(),
        draftId: draftId(),
      }),
    );
    const inB = await client.call(
      client.rpc('protocols.list', { teamId: TEAM_B }),
    );
    expect(inB.map((protocol) => protocol.id)).not.toContain(
      created.protocolId,
    );
  });
});
