// The tenancy spine end to end through the RPC boundary: explicit teamId input
// → membership check → TenantDb → team-scoped rows.
import { randomUUID } from 'node:crypto';

import { Cause, Exit } from 'effect';
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
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { reachableRedis, REDIS_DATABASES } from './support/valkey.ts';

const db = await reachableDb();
const redis = await reachableRedis(REDIS_DATABASES.rpcPlane);

// The payloads are branded, so a test builds its identifiers through the
// contract's own schemas rather than passing bare strings — which is also what
// proves the bounds the boundary enforces are the ones these ids satisfy.
const TEAM_A = TeamId.make('team-a');
const TEAM_B = TeamId.make('team-b');
const protocolId = () => ProtocolId.make(randomUUID());
const draftId = () => DraftId.make(randomUUID());

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'user-1',
  email: 'researcher@example.com',
  emailVerified: true,
  name: 'Researcher',
  locale: null,
  sessionId: 'session-1',
};

describe.skipIf(!db)('team-scoped procedures', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  let dispose: () => Promise<void>;
  let memberships: Record<string, { role: string }>;
  let client: RpcTestClient;
  let anonymousClient: RpcTestClient;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    await provisionScratchSchema(scratch.pool);
    for (const teamId of ['team-a', 'team-b']) {
      await seedTeam(scratch.pool, teamId);
    }
    await scratch.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    // A team Admin throughout: this file is about the tenancy spine, and the
    // protocol surface is addressed by lines no study owns, which #1257's rule
    // shows to an Admin or Owner alone (rpc-protocols.test.ts is where that
    // rule is asserted).
    for (const teamId of ['team-a', 'team-b']) {
      await scratch.pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, 'admin')`,
        [`membership-${teamId}`, teamId, PRINCIPAL.userId],
      );
    }
    memberships = { 'team-a': { role: 'admin' } };
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(memberships[teamId] ?? null),
    });
    client = await createRpcClient(
      createStudio(readEnv(), { auth, pool: scratch.app }),
    );
    anonymousClient = await createRpcClient(
      createStudio(readEnv(), { auth: stubAuthService(), pool: scratch.app }),
    );
  });
  afterAll(async () => {
    await client.dispose();
    await anonymousClient.dispose();
    await dispose();
  });

  it('creates and lists protocols within a member team', async () => {
    const created = await client.call(
      client.rpc('protocols.create', {
        teamId: TEAM_A,
        name: 'Spine Proof',
        protocolId: protocolId(),
        draftId: draftId(),
      }),
    );
    const listed = await client.call(
      client.rpc('protocols.list', { teamId: TEAM_A }),
    );
    expect(listed.map((protocol) => protocol.id)).toContain(created.protocolId);
    const row = listed.find((protocol) => protocol.id === created.protocolId)!;
    expect(row.name).toBe('Spine Proof');
    expect(row.draftId).toBe(created.draftId);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('opens and structures an editor draft', async () => {
    const created = await client.call(
      client.rpc('protocols.create', {
        teamId: TEAM_A,
        name: 'Editor proof',
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
    expect(opened.sections.stageOrder).toEqual({ stages: [stageB, stageA] });
    const staleMove = await client.callExit(
      client.rpc('protocols.moveStage', {
        ...scope,
        stageId: stageA,
        toIndex: 0,
        expectedRevision: beforeMove.revision.sequence,
      }),
    );
    // A stale revision is a store fault rather than a declared refusal, here as
    // it was before the move to the rpc plane: `handleAuditedProtocolCommand`
    // mapped `ProtocolCommandAuthorizationError` and the audited-command's
    // team-not-found and rethrew everything else, which oRPC answered as an
    // internal error. §6.1 gives it no row, so it stays a defect.
    expect(Exit.isFailure(staleMove)).toBe(true);
    if (Exit.isFailure(staleMove)) {
      expect(Cause.hasDies(staleMove.cause)).toBe(true);
    }
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
      // The per-user call limit (#1909) is charged by the team-opening helper,
      // not by the `Authenticated` middleware, and it reaches the client as the
      // contract's `RateLimited` on an ordinary procedure, not only on
      // `team.acceptInvitation`. Stage 4 moves the charge into the middleware
      // (#1932 §3); this case is what proves the move kept the refusal. A fresh
      // user id per run, because the bucket is keyed by it and the window
      // outlives the test.
      const userId = `budget-${randomUUID()}`;
      const limited = await createRpcClient(
        createStudio(
          resolve({
            NODE_ENV: 'test',
            ...(redis ? { REDIS_URL: redis } : {}),
          }),
          {
            auth: stubAuthService({
              getSession: () =>
                Promise.resolve({
                  ...PRINCIPAL,
                  userId,
                  sessionId: `session-${userId}`,
                }),
              getMembership: () => Promise.resolve({ role: 'admin' }),
            }),
            pool: scratch.app,
            limits: { rpc_user: { max: 2, windowMs: 60_000 } },
          },
        ),
      );
      try {
        // `studies.list` rather than `protocols.list`: it opens the same team
        // scope through the same helper, and reads through a store that needs
        // no secrets cipher, which this cut-down environment has none of.
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
      }
    },
  );

  it('scopes rows to the requested team even for a member of both', async () => {
    memberships['team-b'] = { role: 'admin' };
    const created = await client.call(
      client.rpc('protocols.create', {
        teamId: TEAM_A,
        name: 'A-only protocol',
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
