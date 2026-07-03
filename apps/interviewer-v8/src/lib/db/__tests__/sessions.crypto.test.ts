// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { db } from '../db';
import { setSessionDek } from '../sessionKey';
import {
  createSession,
  getSession,
  getSessionsByIds,
  listSessions,
  querySessions,
  updateSession,
} from '../sessions';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const initialNetwork: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: 'Ada' },
    },
  ],
  edges: [],
};

describe('sessions repo — encryption at boundary', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('stores no plaintext network/stageMetadata when unlocked', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });

    const raw = await db.sessions.get(created.id);
    expect(raw?.network).toBeUndefined();
    expect(raw?._enc?.network).toBeDefined();
    expect(raw?.caseId).toBe('case-1'); // index field plaintext
    expect(raw?.currentStep).toBe(0);
  });

  it('round-trips network on read', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const back = await getSession(created.id);
    expect(back?.network).toEqual(initialNetwork);

    const byIds = await getSessionsByIds([created.id]);
    expect(byIds[0]?.network).toEqual(initialNetwork);
  });

  it('re-encrypts on updateSession', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const nextNetwork: NcNetwork = { ...initialNetwork, nodes: [] };
    await updateSession(created.id, { network: nextNetwork, progress: 55 });

    const raw = await db.sessions.get(created.id);
    expect(raw?.network).toBeUndefined();
    expect(raw?.progress).toBe(55); // index field plaintext, no decrypt

    const back = await getSession(created.id);
    expect(back?.network.nodes).toHaveLength(0);
    expect(back?.progress).toBe(55);
  });

  it('lists and queries without touching the key (returns lite rows)', async () => {
    await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });

    // Lock the vault: query paths must not need the DEK.
    setSessionDek(null);

    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]?.caseId).toBe('case-1');
    expect(list[0]?.progressPercent).toBe(0);
    // Lite rows carry no network at all.
    expect('network' in (list[0] ?? {})).toBe(false);

    const result = await querySessions({
      sort: { column: 'updatedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(1);
    expect(result.statusCounts.all).toBe(1);
    expect(result.rows[0]?.caseId).toBe('case-1');
  });
});
