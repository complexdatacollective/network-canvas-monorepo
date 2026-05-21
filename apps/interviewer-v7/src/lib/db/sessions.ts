import { v4 as uuid } from 'uuid';

import type { NcNetwork } from '@codaco/shared-consts';

import { db } from './db';
import type { StoredSession } from './types';

export async function listSessions(): Promise<StoredSession[]> {
  // Dexie Collection.reverse() returns a descending Collection, not an Array.
  // oxlint-disable-next-line unicorn/no-array-reverse
  return db.sessions.orderBy('lastUpdatedAt').reverse().toArray();
}

export async function getSession(
  id: string,
): Promise<StoredSession | undefined> {
  return db.sessions.get(id);
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  const records = await db.sessions.bulkGet([...ids]);
  return records.filter((r): r is StoredSession => Boolean(r));
}

export async function createSession(args: {
  protocolHash: string;
  protocolName: string;
  caseId: string;
  initialNetwork: NcNetwork;
}): Promise<StoredSession> {
  const now = new Date().toISOString();
  const session: StoredSession = {
    id: uuid(),
    protocolHash: args.protocolHash,
    protocolName: args.protocolName,
    caseId: args.caseId,
    startedAt: now,
    lastUpdatedAt: now,
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: args.initialNetwork,
    stageMetadata: undefined,
  };
  await db.sessions.put(session);
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  const existing = await db.sessions.get(id);
  if (!existing) return undefined;
  const updated: StoredSession = {
    ...existing,
    ...patch,
    lastUpdatedAt: new Date().toISOString(),
  };
  await db.sessions.put(updated);
  return updated;
}

export async function markSessionFinished(id: string): Promise<void> {
  const existing = await db.sessions.get(id);
  if (!existing) return;
  await db.sessions.put({
    ...existing,
    finishedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  });
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.sessions, async () => {
    for (const id of ids) {
      const existing = await db.sessions.get(id);
      if (!existing) continue;
      await db.sessions.put({
        ...existing,
        exportedAt: now,
        lastUpdatedAt: now,
      });
    }
  });
}
