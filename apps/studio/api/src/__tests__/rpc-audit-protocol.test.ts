import { randomUUID } from 'node:crypto';

import { Effect, Exit, Option } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';
import { sectionId as sectionIdOf } from '@codaco/studio-sync/taxonomy';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
  uniqueTeamId,
} from './support/database.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

const TEAM_ID = TeamId.make(uniqueTeamId('rpc-audit-protocol-team'));

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'rpc-audit-protocol-owner-user',
  email: 'rpc-audit-protocol-owner@example.com',
  emailVerified: true,
  name: 'RPC Audit Protocol Owner',
  locale: null,
  sessionId: 'rpc-audit-protocol-owner-session',
};

const BUILDER_CALLER: Caller = {
  principal: PRINCIPAL,
  connection: `${PRINCIPAL.userId}-connection`,
  tab: `${PRINCIPAL.userId}-tab`,
};

describe.skipIf(!testDb)('audited protocol RPC', () => {
  let database: TestDatabaseRuntime;
  let client: RpcTestClient;
  let builder: ProtocolBuilderTestClient;
  let extraClients: RpcTestClient[];

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(insertTeam(TEAM_ID));
    await database.run(
      ownerRows(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
      ),
    );
    await database.run(
      ownerRows(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ('rpc-audit-protocol-owner-member', $1, $2, 'owner')`,
        [TEAM_ID, PRINCIPAL.userId],
      ),
    );
    const auth = authServiceStub({
      getSession: () => Effect.succeedSome(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Effect.succeed(
          Option.fromNullishOr(teamId === TEAM_ID ? { role: 'owner' } : null),
        ),
      listMemberships: () =>
        Effect.succeed([{ teamId: TEAM_ID, role: 'owner' }]),
    });
    const studio = createStudio(readEnv(), {
      auth,
      services: database.services,
    });
    client = await createRpcClient(studio);
    builder = await createProtocolBuilderClient(studio);
    extraClients = [];
  });

  afterAll(async () => {
    await client.dispose();
    await builder.dispose();
    for (const extra of extraClients) await extra.dispose();
    await database.dispose();
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
      await database.run(
        ownerRows(
          `SELECT event_type FROM audit_events
           WHERE team_id = $1 AND resource_id = $2`,
          [TEAM_ID, protocolId],
        ),
      ),
    ).toEqual([{ event_type: 'protocol.created' }]);
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

    const sectionId = sectionIdOf({ kind: 'stage', stageId: stageA });
    const held = await builder.call(
      BUILDER_CALLER,
      builder.rpc('AcquireLock', { protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('expected to hold the section');
    const submitInput = {
      protocolId,
      requestId: randomUUID(),
      sectionId,
      document: { ...held.document, label: { en: 'Secret value' } },
      revision: held.revision,
    };
    const committed = await builder.call(
      BUILDER_CALLER,
      builder.rpc('Submit', submitInput),
    );
    await expect(
      builder.call(BUILDER_CALLER, builder.rpc('Submit', submitInput)),
    ).resolves.toEqual(committed);

    const events = await database.run(
      ownerRows<{
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
      ),
    );
    expect(events).toEqual([
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
    expect(new Set(events.map(({ request_id }) => request_id)).size).toBe(5);
    expect(JSON.stringify(events)).not.toContain('Secret value');
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
    const sectionId = sectionIdOf({ kind: 'stage', stageId });
    const held = await builder.call(
      BUILDER_CALLER,
      builder.rpc('AcquireLock', { protocolId, sectionId }),
    );
    if (held.lock !== 'held') throw new Error('expected to hold the section');

    await database.run(
      ownerRows(`
        CREATE FUNCTION reject_protocol_audit_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'protocol audit insert rejected';
        END;
        $$ LANGUAGE plpgsql`),
    );
    await database.run(
      ownerRows(`
        CREATE TRIGGER reject_protocol_audit_insert
          BEFORE INSERT ON audit_events
          FOR EACH ROW EXECUTE FUNCTION reject_protocol_audit_insert()`),
    );
    const submitInput = {
      protocolId,
      requestId: randomUUID(),
      sectionId,
      document: { ...held.document, label: { en: 'Must roll back' } },
      revision: held.revision,
    };
    try {
      const exit = await builder.callExit(
        BUILDER_CALLER,
        builder.rpc('Submit', submitInput),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    } finally {
      await database.run(
        ownerRows('DROP TRIGGER reject_protocol_audit_insert ON audit_events'),
      );
      await database.run(
        ownerRows('DROP FUNCTION reject_protocol_audit_insert()'),
      );
    }

    const afterFailure = await client.call(
      client.rpc('protocols.draft', scope),
    );
    expect(afterFailure.revision).toEqual(before.revision);
    expect(afterFailure.sections[sectionId]).not.toMatchObject({
      label: { en: 'Must roll back' },
    });
    const eventCount = await database.run(
      ownerRows<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_events
         WHERE team_id = $1 AND resource_id = $2`,
        [TEAM_ID, protocolId],
      ),
    );
    expect(eventCount).toEqual([{ count: 2 }]);

    await expect(
      builder.call(BUILDER_CALLER, builder.rpc('Submit', submitInput)),
    ).resolves.toEqual({
      revision: {
        sequence: BigInt(before.revision.sequence) + 1n,
        contentHash: expect.any(String),
      },
    });
    expect(
      await database.run(
        ownerRows(
          `SELECT id FROM audit_events WHERE team_id = $1 AND resource_id = $2`,
          [TEAM_ID, protocolId],
        ),
      ),
    ).toHaveLength(3);
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
    await database.run(
      ownerRows(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [actor.userId, actor.name, actor.email],
      ),
    );
    await database.run(
      ownerRows(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, 'admin')`,
        [memberId, TEAM_ID, actor.userId],
      ),
    );

    let reportMiddlewareAuthorization: () => void = () => undefined;
    const middlewareAuthorized = new Promise<void>((resolve) => {
      reportMiddlewareAuthorization = resolve;
    });
    const revokedClient = await createRpcClient(
      createStudio(readEnv(), {
        services: database.services,
        auth: authServiceStub({
          getSession: () => Effect.succeedSome(actor),
          getMembership: () => {
            reportMiddlewareAuthorization();
            return Effect.succeedSome({ role: 'admin' });
          },
        }),
      }),
    );
    extraClients.push(revokedClient);
    const protocolId = ProtocolId.make(randomUUID());
    const draftId = DraftId.make(randomUUID());
    const { harness } = database;
    const { request } = await database.run(
      harness.onOwner(
        Effect.gen(function* () {
          yield* harness.owner.sql.unsafe(
            `SELECT 1 FROM teams WHERE id = $1 FOR UPDATE`,
            [TEAM_ID],
          );
          const pending = revokedClient.callExit(
            revokedClient.rpc('protocols.create', {
              teamId: TEAM_ID,
              protocolId,
              draftId,
              name: 'Must not be created',
            }),
          );
          yield* Effect.promise(() => middlewareAuthorized);
          yield* harness.owner.sql.unsafe(
            `DELETE FROM team_members WHERE id = $1`,
            [memberId],
          );
          return { request: pending };
        }),
      ),
    );

    await expectRpcFailure(request, 'ProtocolAuthorizationError');
    expect(
      await database.run(
        ownerRows(`SELECT id FROM protocols WHERE id = $1`, [protocolId]),
      ),
    ).toHaveLength(0);
    expect(
      await database.run(
        ownerRows(
          `SELECT id FROM audit_events WHERE team_id = $1 AND resource_id = $2`,
          [TEAM_ID, protocolId],
        ),
      ),
    ).toHaveLength(0);
  });
});
