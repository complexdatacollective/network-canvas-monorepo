import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const db = await reachableDb();
const TEAM_ID = 'rpc-audit-protocol-team';

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
  let dispose: () => Promise<void>;
  let client: ReturnType<typeof createRpcClient>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    appPool = scratch.app;
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
    });
    client = createRpcClient(createApp(readEnv(), { auth, pool: appPool }));
  });

  afterAll(async () => {
    await dispose();
  });

  it('records each current protocol mutation once without command contents', async () => {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    const stageA = randomUUID();
    const stageB = randomUUID();
    const scope = { teamId: TEAM_ID, protocolId, draftId };
    const createInput = { ...scope, name: 'Audited protocol' };

    await expect(client.protocols.create(createInput)).resolves.toEqual({
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
    await expect(client.protocols.create(createInput)).resolves.toEqual({
      protocolId,
      draftId,
    });

    await client.protocols.addInformationStage({ ...scope, stageId: stageA });
    await client.protocols.addInformationStage({ ...scope, stageId: stageB });
    const beforeMove = await client.protocols.draft(scope);
    const moved = await client.protocols.moveStage({
      ...scope,
      stageId: stageB,
      toIndex: 0,
      expectedRevision: beforeMove.revision.sequence,
    });
    // A move to the current index is a successful no-op, not another commit.
    await expect(
      client.protocols.moveStage({
        ...scope,
        stageId: stageB,
        toIndex: 0,
        expectedRevision: moved.sequence,
      }),
    ).resolves.toEqual(moved);
    const staleMove = await safe(
      client.protocols.moveStage({
        ...scope,
        stageId: stageA,
        toIndex: 0,
        expectedRevision: beforeMove.revision.sequence,
      }),
    );
    expect(staleMove.error).not.toBeNull();

    const clientId = randomUUID();
    const sectionId = `stage:${stageA}`;
    const lease = await client.protocols.acquireSection({
      ...scope,
      sectionId,
      clientId,
    });
    if (lease.mode !== 'editable') throw new Error('expected editable lease');
    const commitInput = {
      ...scope,
      sectionId,
      clientId,
      leaseEpoch: lease.leaseEpoch,
      clientSequence: '1',
      commands: [{ op: 'set' as const, key: 'label', value: 'Secret value' }],
    };
    const committed = await client.protocols.commitSection(commitInput);
    await expect(client.protocols.commitSection(commitInput)).resolves.toEqual(
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
          revision: committed.sequence,
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
    const protocolId = randomUUID();
    const draftId = randomUUID();
    const stageId = randomUUID();
    const scope = { teamId: TEAM_ID, protocolId, draftId };
    await client.protocols.create({ ...scope, name: 'Rollback protocol' });
    await client.protocols.addInformationStage({ ...scope, stageId });
    const before = await client.protocols.draft(scope);
    const clientId = randomUUID();
    const sectionId = `stage:${stageId}`;
    const lease = await client.protocols.acquireSection({
      ...scope,
      sectionId,
      clientId,
    });
    if (lease.mode !== 'editable') throw new Error('expected editable lease');

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
    const commitInput = {
      ...scope,
      sectionId,
      clientId,
      leaseEpoch: lease.leaseEpoch,
      clientSequence: '1',
      commands: [{ op: 'set' as const, key: 'label', value: 'Must roll back' }],
    };
    try {
      const { error } = await safe(client.protocols.commitSection(commitInput));
      expect(error).not.toBeNull();
    } finally {
      await pool.query(`
        DROP TRIGGER reject_protocol_audit_insert ON audit_events;
        DROP FUNCTION reject_protocol_audit_insert();
      `);
    }

    const afterFailure = await client.protocols.draft(scope);
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

    // The command-log insert rolled back too, so this is a real first commit,
    // not a deduplicated replay that could hide the missing audit event.
    await expect(client.protocols.commitSection(commitInput)).resolves.toEqual({
      sequence: String(BigInt(before.revision.sequence) + 1n),
      hash: expect.any(String),
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
    const revokedClient = createRpcClient(
      createApp(readEnv(), {
        pool: appPool,
        auth: stubAuthService({
          getSession: () => Promise.resolve(actor),
          getMembership: () => {
            reportMiddlewareAuthorization();
            return Promise.resolve({ role: 'admin' });
          },
        }),
      }),
    );
    const protocolId = randomUUID();
    const draftId = randomUUID();
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT 1 FROM teams WHERE id = $1 FOR UPDATE`, [
        TEAM_ID,
      ]);

      const request = safe(
        revokedClient.protocols.create({
          teamId: TEAM_ID,
          protocolId,
          draftId,
          name: 'Must not be created',
        }),
      );
      await middlewareAuthorized;
      await holder.query(`DELETE FROM team_members WHERE id = $1`, [memberId]);
      await holder.query('COMMIT');

      const { error } = await request;
      expect(error).toMatchObject({ code: 'FORBIDDEN' });
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
