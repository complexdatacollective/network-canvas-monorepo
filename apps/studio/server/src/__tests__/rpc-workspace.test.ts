// The tenancy spine end to end through the RPC boundary: explicit workspaceId
// input → membership check → TenantDb → workspace-scoped rows.
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
  seedWorkspace,
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

describe.skipIf(!db)('workspace-scoped procedures', () => {
  let dispose: () => Promise<void>;
  let memberships: Record<string, { role: string }>;
  let client: RouterContractClient<typeof contract>;
  let anonymousClient: RouterContractClient<typeof contract>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    dispose = scratch.dispose;
    await provisionScratchSchema(scratch.pool);
    for (const workspaceId of ['ws-a', 'ws-b']) {
      await seedWorkspace(scratch.pool, workspaceId);
    }
    memberships = { 'ws-a': { role: 'member' } };
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, workspaceId) =>
        Promise.resolve(memberships[workspaceId] ?? null),
    });
    client = createRpcClient(
      createApp(readEnv(), { auth, pool: scratch.pool }),
    );
    anonymousClient = createRpcClient(
      createApp(readEnv(), { auth: stubAuthService(), pool: scratch.pool }),
    );
  });
  afterAll(async () => {
    await dispose();
  });

  it('creates and lists protocols within a member workspace', async () => {
    const created = await client.protocols.create({
      workspaceId: 'ws-a',
      name: 'Spine Proof',
    });
    const listed = await client.protocols.list({ workspaceId: 'ws-a' });
    expect(listed.map((protocol) => protocol.id)).toContain(created.protocolId);
    const row = listed.find((protocol) => protocol.id === created.protocolId)!;
    expect(row.name).toBe('Spine Proof');
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('refuses a non-member workspace and an unknown workspace identically', async () => {
    const nonMember = await safe(
      client.protocols.list({ workspaceId: 'ws-b' }),
    );
    expect(nonMember.error).toMatchObject({ code: 'FORBIDDEN' });
    const unknown = await safe(
      client.protocols.list({ workspaceId: 'ws-none' }),
    );
    expect(unknown.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses without a session', async () => {
    const { error } = await safe(
      anonymousClient.protocols.list({ workspaceId: 'ws-a' }),
    );
    expect(error).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('scopes rows to the requested workspace even for a member of both', async () => {
    memberships['ws-b'] = { role: 'member' };
    const created = await client.protocols.create({
      workspaceId: 'ws-a',
      name: 'A-only protocol',
    });
    const inB = await client.protocols.list({ workspaceId: 'ws-b' });
    expect(inB.map((protocol) => protocol.id)).not.toContain(
      created.protocolId,
    );
  });
});
