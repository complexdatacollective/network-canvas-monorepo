import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { Cause, Exit } from 'effect';
import type { Context } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio, type Studio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { createProtocolBuilderRuntime } from '../protocol-builder/runtime.ts';
import { createRpcRouter } from '../rpc.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
  uniqueTeamId,
} from './support/postgres.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

const db = await reachableDb();
const TEAM_ID = TeamId.make(uniqueTeamId('rpc-audit-protocol-team'));

/**
 * The protocol-builder host beside the rpc plane. It is still an oRPC router
 * served over `/ws` until stage 8, so this file drives it in process — the
 * same `Studio` behind both, so an edit made through one is the edit the other
 * reads back.
 */
function builderClientFor(studio: Studio, who: SessionPrincipal) {
  return createRouterClient(
    createRpcRouter({
      ...studio.rpc,
      protocolBuilder: createProtocolBuilderRuntime(),
    }),
    {
      context: {
        principal: who,
        requestId: randomUUID(),
        connectionId: `${who.userId}-connection`,
        clientSessionId: `${who.userId}-tab`,
      },
    },
  );
}

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'rpc-audit-protocol-owner-user',
  email: 'rpc-audit-protocol-owner@example.com',
  emailVerified: true,
  name: 'RPC Audit Protocol Owner',
  locale: null,
  sessionId: 'rpc-audit-protocol-owner-session',
};

describe.skipIf(!db)('audited protocol RPC', () => {
  let pool: pg.Pool;
  let appPool: pg.Pool;
  /**
   * The Effect data layer over this scratch schema, which is what every
   * `/rpc` handler runs its reads and writes on. Held beside the pool rather
   * than built per Studio: the clients underneath it are connection pools.
   */
  let services: Context.Context<StudioServices>;
  let dispose: () => Promise<void>;
  let client: RpcTestClient;
  let builder: ReturnType<typeof builderClientFor>;
  let extraClients: RpcTestClient[];

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    appPool = scratch.app;
    services = await scratch.services();
    dispose = scratch.dispose;
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM_ID);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ('rpc-audit-protocol-owner-member', $1, $2, 'owner')`,
      [TEAM_ID, PRINCIPAL.userId],
    );
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(teamId === TEAM_ID ? { role: 'owner' } : null),
      // The protocol-builder host takes no teamId: it derives the tenant from
      // the caller's own memberships, so a stub that lists none would refuse
      // every write here for a reason this file is not about.
      listMemberships: () =>
        Promise.resolve([{ teamId: TEAM_ID, role: 'owner' }]),
    });
    const studio = createStudio(readEnv(), { auth, pool: appPool, services });
    client = await createRpcClient(studio);
    builder = builderClientFor(studio, PRINCIPAL);
    extraClients = [];
  });

  afterAll(async () => {
    await client.dispose();
    for (const extra of extraClients) await extra.dispose();
    await dispose();
  });

  it('records each current protocol mutation once without command contents', async () => {
    const protocolId = ProtocolId.make(randomUUID());
    const draftId = DraftId.make(randomUUID());
    const stageA = StageId.make(randomUUID());
    const stageB = StageId.make(randomUUID());
    const scope = { teamId: TEAM_ID, protocolId, draftId };
    const createInput = { ...scope, name: 'Audited protocol' };

    await expect(
      client.call(client.rpc('protocols.create', createInput)),
    ).resolves.toEqual({
      protocolId,
      draftId,
    });
    expect(
      await pool.query(
        `SELECT event_type FROM audit_events
         WHERE team_id = $1 AND resource_id = $2`,
        [TEAM_ID, protocolId],
      ),
    ).toHaveProperty('rows', [{ event_type: 'protocol.created' }]);
    // The caller may retry after losing the first response. Returning the
    // existing identity is not a second creation and must not add an event.
    await expect(
      client.call(client.rpc('protocols.create', createInput)),
    ).resolves.toEqual({
      protocolId,
      draftId,
    });

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
    const moved = await client.call(
      client.rpc('protocols.moveStage', {
        ...scope,
        stageId: stageB,
        toIndex: 0,
        expectedRevision: beforeMove.revision.sequence,
      }),
    );
    // A move to the current index is a successful no-op, not another commit.
    await expect(
      client.call(
        client.rpc('protocols.moveStage', {
          ...scope,
          stageId: stageB,
          toIndex: 0,
          expectedRevision: moved.sequence,
        }),
      ),
    ).resolves.toEqual(moved);
    // A stale revision is a store fault rather than a declared refusal, here
    // as it was before the move to the rpc plane: the oRPC router answered it
    // as an internal error, so on the Effect plane the call dies.
    const staleMove = await client.callExit(
      client.rpc('protocols.moveStage', {
        ...scope,
        stageId: stageA,
        toIndex: 0,
        expectedRevision: beforeMove.revision.sequence,
      }),
    );
    expect(Exit.isFailure(staleMove)).toBe(true);
    if (Exit.isFailure(staleMove)) {
      expect(Cause.hasDies(staleMove.cause)).toBe(true);
    }

    const sectionId = `stage:${stageA}`;
    const held = await builder.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    if (held.lock !== 'held') throw new Error('expected to hold the section');
    const submitInput = {
      protocolId,
      requestId: randomUUID(),
      sectionId,
      document: { ...held.document, label: 'Secret value' },
      revision: held.revision,
    };
    const committed = await builder.protocolBuilder.submit(submitInput);
    // The same request id: a client whose answer was lost. It must be answered
    // with what the first attempt wrote, and add no second event.
    await expect(builder.protocolBuilder.submit(submitInput)).resolves.toEqual(
      committed,
    );

    const events = await pool.query<{
      event_type: string;
      event_version: number;
      category: string;
      resource_label: string;
      request_id: string;
      details: unknown;
    }>(
      `SELECT event_type, event_version, category, resource_label,
              request_id::text, details
       FROM audit_events
       WHERE team_id = $1 AND resource_id = $2
       ORDER BY sequence`,
      [TEAM_ID, protocolId],
    );
    expect(events.rows).toEqual([
      {
        event_type: 'protocol.created',
        event_version: 1,
        category: 'protocol',
        resource_label: 'Audited protocol',
        request_id: expect.any(String),
        details: { draftId },
      },
      {
        event_type: 'protocol.draft.committed',
        event_version: 1,
        category: 'protocol',
        resource_label: 'Audited protocol',
        request_id: expect.any(String),
        details: {
          draftId,
          revision: '1',
          affectedSectionIds: [`stage:${stageA}`, 'stageOrder'],
          operationTypes: ['addStage'],
          operationCount: 1,
        },
      },
      {
        event_type: 'protocol.draft.committed',
        event_version: 1,
        category: 'protocol',
        resource_label: 'Audited protocol',
        request_id: expect.any(String),
        details: {
          draftId,
          revision: '2',
          affectedSectionIds: [`stage:${stageB}`, 'stageOrder'],
          operationTypes: ['addStage'],
          operationCount: 1,
        },
      },
      {
        event_type: 'protocol.draft.committed',
        event_version: 1,
        category: 'protocol',
        resource_label: 'Audited protocol',
        request_id: expect.any(String),
        details: {
          draftId,
          revision: moved.sequence,
          affectedSectionIds: ['stageOrder'],
          operationTypes: ['moveStage'],
          operationCount: 1,
        },
      },
      {
        event_type: 'protocol.draft.committed',
        event_version: 1,
        category: 'protocol',
        resource_label: 'Audited protocol',
        request_id: expect.any(String),
        details: {
          draftId,
          revision: String(committed.revision.sequence),
          affectedSectionIds: [sectionId],
          operationTypes: ['set'],
          operationCount: 1,
        },
      },
    ]);
    expect(new Set(events.rows.map(({ request_id }) => request_id)).size).toBe(
      5,
    );
    expect(JSON.stringify(events.rows)).not.toContain('Secret value');
  });

  it('rolls protocol state back when its audit insert fails', async () => {
    const protocolId = ProtocolId.make(randomUUID());
    const draftId = DraftId.make(randomUUID());
    const stageId = StageId.make(randomUUID());
    const scope = { teamId: TEAM_ID, protocolId, draftId };
    await client.call(
      client.rpc('protocols.create', { ...scope, name: 'Rollback protocol' }),
    );
    await client.call(
      client.rpc('protocols.addInformationStage', { ...scope, stageId }),
    );
    const before = await client.call(client.rpc('protocols.draft', scope));
    const sectionId = `stage:${stageId}`;
    const held = await builder.protocolBuilder.acquireLock({
      protocolId,
      sectionId,
    });
    if (held.lock !== 'held') throw new Error('expected to hold the section');

    await pool.query(`
      CREATE FUNCTION reject_protocol_audit_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'protocol audit insert rejected';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_protocol_audit_insert
        BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION reject_protocol_audit_insert();
    `);
    const submitInput = {
      protocolId,
      requestId: randomUUID(),
      sectionId,
      document: { ...held.document, label: 'Must roll back' },
      revision: held.revision,
    };
    try {
      const { error } = await safe(builder.protocolBuilder.submit(submitInput));
      expect(error).not.toBeNull();
    } finally {
      await pool.query(`
        DROP TRIGGER reject_protocol_audit_insert ON audit_events;
        DROP FUNCTION reject_protocol_audit_insert();
      `);
    }

    const afterFailure = await client.call(
      client.rpc('protocols.draft', scope),
    );
    expect(afterFailure.revision).toEqual(before.revision);
    expect(afterFailure.sections[sectionId]).not.toMatchObject({
      label: 'Must roll back',
    });
    const eventCount = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
       WHERE team_id = $1 AND resource_id = $2`,
      [TEAM_ID, protocolId],
    );
    expect(eventCount.rows).toEqual([{ count: 2 }]);

    // The write receipt rolled back too, so a retry carrying the same request
    // id is a real first write rather than a replay of one that never
    // happened — which is what would otherwise hide the missing audit event.
    await expect(builder.protocolBuilder.submit(submitInput)).resolves.toEqual({
      revision: {
        sequence: BigInt(before.revision.sequence) + 1n,
        contentHash: expect.any(String),
      },
    });
    expect(
      await pool.query(
        `SELECT id FROM audit_events WHERE team_id = $1 AND resource_id = $2`,
        [TEAM_ID, protocolId],
      ),
    ).toHaveProperty('rowCount', 3);
  });

  it('re-authorizes membership after waiting for the audit lock', async () => {
    const actorId = 'rpc-audit-revoked-user';
    const memberId = 'rpc-audit-revoked-member';
    const actor: SessionPrincipal = {
      kind: 'user',
      userId: actorId,
      email: 'rpc-audit-revoked@example.com',
      emailVerified: true,
      name: 'Revoked protocol member',
      locale: null,
      sessionId: 'rpc-audit-revoked-session',
    };
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [actor.userId, actor.name, actor.email],
    );
    // An Admin, so the middleware admits the request and the refusal below can
    // only come from the locked membership re-read inside the transaction —
    // which is what this test is about.
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, 'admin')`,
      [memberId, TEAM_ID, actor.userId],
    );

    let reportMiddlewareAuthorization: () => void = () => undefined;
    const middlewareAuthorized = new Promise<void>((resolve) => {
      reportMiddlewareAuthorization = resolve;
    });
    const revokedClient = await createRpcClient(
      createStudio(readEnv(), {
        pool: appPool,
        services,
        auth: stubAuthService({
          getSession: () => Promise.resolve(actor),
          getMembership: () => {
            reportMiddlewareAuthorization();
            return Promise.resolve({ role: 'admin' });
          },
        }),
      }),
    );
    extraClients.push(revokedClient);
    const protocolId = ProtocolId.make(randomUUID());
    const draftId = DraftId.make(randomUUID());
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT 1 FROM teams WHERE id = $1 FOR UPDATE`, [
        TEAM_ID,
      ]);

      const request = revokedClient.callExit(
        revokedClient.rpc('protocols.create', {
          teamId: TEAM_ID,
          protocolId,
          draftId,
          name: 'Must not be created',
        }),
      );
      await middlewareAuthorized;
      await holder.query(`DELETE FROM team_members WHERE id = $1`, [memberId]);
      await holder.query('COMMIT');

      // The protocol tier's own refusal for a membership that lost its role
      // under the lock, which is what the oRPC plane flattened into
      // `FORBIDDEN`.
      await expectRpcFailure(request, 'ProtocolAuthorizationError');
      expect(
        await pool.query(`SELECT id FROM protocols WHERE id = $1`, [
          protocolId,
        ]),
      ).toHaveProperty('rowCount', 0);
      expect(
        await pool.query(
          `SELECT id FROM audit_events WHERE team_id = $1 AND resource_id = $2`,
          [TEAM_ID, protocolId],
        ),
      ).toHaveProperty('rowCount', 0);
    } catch (error) {
      await holder.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      holder.release();
    }
  });
});
