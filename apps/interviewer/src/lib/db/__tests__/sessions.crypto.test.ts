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
  markSessionFinished,
  markSessionsExported,
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

// Formats a Date as its LOCAL calendar day, matching the 'YYYY-MM-DD' strings
// the DateFilter emits from the user's timezone (never toISOString(), which
// would report the UTC day).
function localDayString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('sessions repo — date range filtering (#753)', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('includes a same-local-day session regardless of timezone offset', async () => {
    // An instant near local midnight is where the UTC-vs-local frame mismatch
    // bites: west of UTC its ISO string can land on the next UTC day, east of
    // UTC on the previous one. The row must still match its own local day.
    const localInstant = new Date(2026, 2, 15, 23, 30, 0, 0);
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await db.sessions.update(created.id, {
      startedAt: localInstant.toISOString(),
    });

    const day = localDayString(localInstant);
    const result = await querySessions({
      startedRange: { from: day, to: day },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(1);
    expect(result.rows[0]?.id).toBe(created.id);
  });

  it('excludes a session on an adjacent local day', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const dayBefore = new Date(2026, 2, 14, 12, 0, 0, 0);
    await db.sessions.update(created.id, {
      startedAt: dayBefore.toISOString(),
    });

    const target = localDayString(new Date(2026, 2, 15, 12, 0, 0, 0));
    const result = await querySessions({
      startedRange: { from: target, to: target },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(0);
  });

  it('drops a malformed range bound rather than throwing', async () => {
    await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const result = await querySessions({
      startedRange: { from: 'not-a-date', to: 'also-bad' },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(0);
  });

  it('drops an out-of-range (overflow) calendar bound rather than rolling over', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    // Pin the session to a real date; the filter bounds are impossible dates
    // (2026-02-31 rolls over to March 3 if not rejected), so nothing should
    // match — a shape-valid-but-overflow bound must not become a real filter.
    await db.sessions.update(created.id, {
      startedAt: '2026-02-15T12:00:00.000Z',
    });
    const result = await querySessions({
      startedRange: { from: '2026-02-31', to: '2026-13-01' },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(0);
  });
});

describe('sessions repo — status reflects completion, not export (#764)', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('keeps an exported-but-unfinished session in-progress', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    // Export without finishing: the old model misread this as complete/exported,
    // hiding Resume and miscounting the chips.
    await markSessionsExported([created.id]);

    const list = await listSessions();
    expect(list[0]?.statusKind).toBe('in-progress');
    expect(list[0]?.exportedAt).not.toBeNull();

    const result = await querySessions({
      sort: { column: 'updatedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.statusCounts.inProgress).toBe(1);
    expect(result.statusCounts.complete).toBe(0);
  });

  it('marks a finished session complete whether or not it is exported', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await markSessionFinished(created.id);
    await markSessionsExported([created.id]);

    const list = await listSessions();
    expect(list[0]?.statusKind).toBe('complete');

    const result = await querySessions({
      sort: { column: 'updatedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.statusCounts.complete).toBe(1);
    expect(result.statusCounts.inProgress).toBe(0);
  });
});

describe('sessions repo — concurrent updateSession (#756)', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('serialises overlapping updates so no write is clobbered', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });

    // Two updates fired without awaiting the first. Under the old read-modify-
    // write both read the same pre-update row and the last put would overwrite
    // the other's field; serialised, both must survive.
    await Promise.all([
      updateSession(created.id, { currentStep: 1 }),
      updateSession(created.id, { progress: 77 }),
    ]);

    const back = await getSession(created.id);
    expect(back?.currentStep).toBe(1);
    expect(back?.progress).toBe(77);
  });
});
