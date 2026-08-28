// The tenancy spine end to end through the RPC boundary: explicit teamId input
// → membership check → TenantDb → team-scoped rows.
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
  sessionId: 'session-1',
};

describe.skipIf(!db)('team-scoped procedures', () => {
  let dispose: () => Promise<void>;
  let memberships: Record<string, { role: string }>;
  let client: RouterContractClient<typeof contract>;
  let anonymousClient: RouterContractClient<typeof contract>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    await provisionScratchSchema(scratch.pool);
    for (const teamId of ['team-a', 'team-b']) {
      await seedTeam(scratch.pool, teamId);
    }
    memberships = { 'team-a': { role: 'member' } };
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
    await client.protocols.moveStage({ ...scope, stageId: stageB, toIndex: 0 });

    const opened = await client.protocols.draft(scope);
    expect(opened.sections.stageOrder).toEqual({ stages: [stageB, stageA] });

    const clientId = '33333333-3333-4333-8333-333333333333';
    const sectionId = `stage:${stageA}`;
    const lease = await client.protocols.acquireSection({
      ...scope,
      sectionId,
      clientId,
    });
    expect(lease.mode).toBe('editable');
    if (lease.mode !== 'editable') throw new Error('expected editable lease');

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
    memberships['team-b'] = { role: 'member' };
    const created = await client.protocols.create({
      teamId: 'team-a',
      name: 'A-only protocol',
    });
    const inB = await client.protocols.list({ teamId: 'team-b' });
    expect(inB.map((protocol) => protocol.id)).not.toContain(
      created.protocolId,
    );
  });
});
