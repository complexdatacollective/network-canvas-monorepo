// The tenancy spine end to end through the RPC boundary: explicit teamId input
// → membership check → TenantDb → team-scoped rows.
import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { contract } from '@codaco/studio-rpc';

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
  let dispose: () => Promise<void>;
  let ownerPool: Parameters<typeof provisionScratchSchema>[0];
  let memberships: Record<string, { role: string }>;
  let client: RouterContractClient<typeof contract>;
  let anonymousClient: RouterContractClient<typeof contract>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    ownerPool = scratch.pool;
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
    client = createRpcClient(createApp(readEnv(), { auth, pool: scratch.app }));
    anonymousClient = createRpcClient(
      createApp(readEnv(), { auth: stubAuthService(), pool: scratch.app }),
    );
  });
  afterAll(async () => {
    await dispose();
  });

  it('creates and lists protocols within a member team', async () => {
    const created = await client.protocols.create({
      teamId: 'team-a',
      name: 'Spine Proof',
      protocolId: randomUUID(),
      draftId: randomUUID(),
    });
    const listed = await client.protocols.list({ teamId: 'team-a' });
    expect(listed.map((protocol) => protocol.id)).toContain(created.protocolId);
    const row = listed.find((protocol) => protocol.id === created.protocolId)!;
    expect(row.name).toBe('Spine Proof');
    expect(row.draftId).toBe(created.draftId);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('opens, structures, leases, and commits an editor draft', async () => {
    const created = await client.protocols.create({
      teamId: 'team-a',
      name: 'Editor proof',
      protocolId: randomUUID(),
      draftId: randomUUID(),
    });
    const scope = {
      teamId: 'team-a',
      protocolId: created.protocolId,
      draftId: created.draftId,
    };
    const stageA = '11111111-1111-4111-8111-111111111111';
    const stageB = '22222222-2222-4222-8222-222222222222';
    await client.protocols.addInformationStage({ ...scope, stageId: stageA });
    await client.protocols.addInformationStage({ ...scope, stageId: stageB });
    const beforeMove = await client.protocols.draft(scope);
    await client.protocols.moveStage({
      ...scope,
      stageId: stageB,
      toIndex: 0,
      expectedRevision: beforeMove.revision.sequence,
    });

    const opened = await client.protocols.draft(scope);
    expect(opened.sections.stageOrder).toEqual({ stages: [stageB, stageA] });
    const staleMove = await safe(
      client.protocols.moveStage({
        ...scope,
        stageId: stageA,
        toIndex: 0,
        expectedRevision: beforeMove.revision.sequence,
      }),
    );
    expect(staleMove.error).not.toBeNull();

    const clientId = '33333333-3333-4333-8333-333333333333';
    const sectionId = `stage:${stageA}`;
    const lease = await client.protocols.acquireSection({
      ...scope,
      sectionId,
      clientId,
    });
    expect(lease.mode).toBe('editable');
    if (lease.mode !== 'editable') throw new Error('expected editable lease');
    expect(lease.nextClientSequence).toBe('1');

    const revision = await client.protocols.commitSection({
      ...scope,
      sectionId,
      clientId,
      leaseEpoch: lease.leaseEpoch,
      clientSequence: '1',
      commands: [{ op: 'set', key: 'label', value: 'Welcome' }],
    });
    expect(BigInt(revision.sequence)).toBeGreaterThan(0n);
    expect(
      (await client.protocols.draft(scope)).sections[sectionId],
    ).toMatchObject({ label: 'Welcome' });
    const reacquired = await client.protocols.acquireSection({
      ...scope,
      sectionId,
      clientId,
    });
    expect(reacquired).toMatchObject({
      mode: 'editable',
      leaseEpoch: lease.leaseEpoch,
      nextClientSequence: '2',
    });
    expect(
      await client.protocols.renewSection({
        ...scope,
        sectionId,
        clientId,
        leaseEpoch: lease.leaseEpoch,
      }),
    ).toEqual({ renewed: true });
    await client.protocols.releaseSection({
      ...scope,
      sectionId,
      clientId,
      leaseEpoch: lease.leaseEpoch,
    });
  });

  it('releases an acquired section when resume post-processing fails', async () => {
    const created = await client.protocols.create({
      teamId: 'team-a',
      name: 'Resume failure proof',
      protocolId: randomUUID(),
      draftId: randomUUID(),
    });
    const scope = {
      teamId: 'team-a',
      protocolId: created.protocolId,
      draftId: created.draftId,
    };
    const stageId = randomUUID();
    const sectionId = `stage:${stageId}`;
    await client.protocols.addInformationStage({ ...scope, stageId });

    await ownerPool.query(
      'ALTER TABLE command_log RENAME TO command_log_unavailable',
    );
    try {
      const failed = await safe(
        client.protocols.acquireSection({
          ...scope,
          sectionId,
          clientId: randomUUID(),
        }),
      );
      expect(failed.error).not.toBeNull();
    } finally {
      await ownerPool.query(
        'ALTER TABLE command_log_unavailable RENAME TO command_log',
      );
    }

    await expect(
      client.protocols.acquireSection({
        ...scope,
        sectionId,
        clientId: randomUUID(),
      }),
    ).resolves.toMatchObject({ mode: 'editable' });
  });

  it('refuses a non-member team and an unknown team identically', async () => {
    const nonMember = await safe(client.protocols.list({ teamId: 'team-b' }));
    expect(nonMember.error).toMatchObject({ code: 'FORBIDDEN' });
    const unknown = await safe(client.protocols.list({ teamId: 'team-none' }));
    expect(unknown.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses without a session', async () => {
    const { error } = await safe(
      anonymousClient.protocols.list({ teamId: 'team-a' }),
    );
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('scopes rows to the requested team even for a member of both', async () => {
    memberships['team-b'] = { role: 'admin' };
    const created = await client.protocols.create({
      teamId: 'team-a',
      name: 'A-only protocol',
      protocolId: randomUUID(),
      draftId: randomUUID(),
    });
    const inB = await client.protocols.list({ teamId: 'team-b' });
    expect(inB.map((protocol) => protocol.id)).not.toContain(
      created.protocolId,
    );
  });
});
