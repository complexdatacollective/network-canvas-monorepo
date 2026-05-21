import { v4 as uuid } from 'uuid';

import type { NcNetwork } from '@codaco/shared-consts';

import { db } from './db';
import type {
  SessionQueryParams,
  SessionQueryResult,
  SessionStatusKind,
  StoredSession,
  StoredSessionLite,
} from './types';

function deriveStatusKind(session: StoredSession): SessionStatusKind {
  if (session.exportedAt) return 'exported';
  if (session.finishedAt) return 'complete';
  return 'in-progress';
}

function deriveProgressPercent(
  session: StoredSession,
  stageCountByHash: Map<string, number>,
): number {
  if (session.finishedAt) return 100;
  const totalStages = stageCountByHash.get(session.protocolHash) ?? 0;
  if (totalStages === 0) return 0;
  return Math.min(100, (session.currentStep / totalStages) * 100);
}

function toLite(
  session: StoredSession,
  stageCountByHash: Map<string, number>,
): StoredSessionLite {
  return {
    id: session.id,
    protocolHash: session.protocolHash,
    protocolName: session.protocolName,
    caseId: session.caseId,
    startedAt: session.startedAt,
    lastUpdatedAt: session.lastUpdatedAt,
    finishedAt: session.finishedAt,
    exportedAt: session.exportedAt,
    currentStep: session.currentStep,
    isSynthetic: session.isSynthetic,
    statusKind: deriveStatusKind(session),
    progressPercent: deriveProgressPercent(session, stageCountByHash),
  };
}

export async function listSessions(): Promise<StoredSessionLite[]> {
  const rows = await db.sessions
    .orderBy('lastUpdatedAt')
    // Dexie Collection.reverse() returns a descending Collection, not an Array.
    // oxlint-disable-next-line unicorn/no-array-reverse
    .reverse()
    .toArray();
  // listSessions callers don't render the progress column, so skip the
  // protocol fetch and pass an empty map (progressPercent falls back to 0).
  const emptyStageCounts = new Map<string, number>();
  return rows.map((session) => toLite(session, emptyStageCounts));
}

function inDateRange(
  isoDate: string | null,
  range: { from: string; to: string },
): boolean {
  if (!isoDate) return false;
  const rowDate = new Date(isoDate);
  if (Number.isNaN(rowDate.getTime())) return false;
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  toDate.setHours(23, 59, 59, 999);
  return rowDate >= fromDate && rowDate <= toDate;
}

function matchesNonStatusFilters(
  session: StoredSession,
  params: SessionQueryParams,
): boolean {
  const search = params.search?.trim().toLowerCase() ?? '';
  if (search.length > 0) {
    if (
      !session.caseId.toLowerCase().includes(search) &&
      !session.protocolName.toLowerCase().includes(search)
    ) {
      return false;
    }
  }

  const caseIdFilter = params.caseId?.trim().toLowerCase() ?? '';
  if (caseIdFilter.length > 0) {
    if (!session.caseId.toLowerCase().includes(caseIdFilter)) return false;
  }

  if (params.protocolNames && params.protocolNames.length > 0) {
    if (!params.protocolNames.includes(session.protocolName)) return false;
  }

  if (params.startedRange) {
    if (!inDateRange(session.startedAt, params.startedRange)) return false;
  }

  if (params.updatedRange) {
    if (!inDateRange(session.lastUpdatedAt, params.updatedRange)) return false;
  }

  if (params.exported !== undefined) {
    const hasExport = session.exportedAt !== null;
    if (hasExport !== params.exported) return false;
  }

  return true;
}

const STATUS_ORDER: Record<SessionStatusKind, number> = {
  'in-progress': 0,
  'complete': 1,
  'exported': 2,
};

function compareLite(
  a: StoredSessionLite,
  b: StoredSessionLite,
  column: SessionQueryParams['sort']['column'],
): number {
  if (column === 'caseId') return a.caseId.localeCompare(b.caseId);
  if (column === 'protocolName') {
    return a.protocolName.localeCompare(b.protocolName);
  }
  if (column === 'startedAt') return a.startedAt.localeCompare(b.startedAt);
  if (column === 'updatedAt') {
    return a.lastUpdatedAt.localeCompare(b.lastUpdatedAt);
  }
  if (column === 'progress') return a.progressPercent - b.progressPercent;
  if (column === 'status') {
    return STATUS_ORDER[a.statusKind] - STATUS_ORDER[b.statusKind];
  }
  // column === 'exportedAt'. Null positioning is symmetric with direction:
  // nulls last on ASC, first on DESC. Returning +1 for null `a` here pushes
  // it to the end on ASC; the direction flip in sortLite pulls it to the
  // start on DESC.
  if (a.exportedAt === null && b.exportedAt === null) return 0;
  if (a.exportedAt === null) return 1;
  if (b.exportedAt === null) return -1;
  return a.exportedAt.localeCompare(b.exportedAt);
}

function sortLite(
  rows: StoredSessionLite[],
  sort: SessionQueryParams['sort'],
): StoredSessionLite[] {
  const directionMultiplier = sort.direction === 'asc' ? 1 : -1;
  return rows.toSorted((a, b) => {
    const primary = compareLite(a, b, sort.column) * directionMultiplier;
    if (primary !== 0) return primary;
    return a.id.localeCompare(b.id);
  });
}

async function loadStageCountByHash(): Promise<Map<string, number>> {
  const protocols = await db.protocols.toArray();
  const map = new Map<string, number>();
  for (const protocol of protocols) {
    map.set(protocol.hash, protocol.protocol.stages?.length ?? 0);
  }
  return map;
}

export async function querySessions(
  params: SessionQueryParams,
): Promise<SessionQueryResult> {
  const [allSessions, stageCountByHash] = await Promise.all([
    db.sessions.toArray(),
    loadStageCountByHash(),
  ]);

  // Status counts use all filters except `statuses` so the chip counts
  // reflect totals within the rest of the active filter set.
  const preStatusLite: StoredSessionLite[] = [];
  for (const session of allSessions) {
    if (!matchesNonStatusFilters(session, params)) continue;
    preStatusLite.push(toLite(session, stageCountByHash));
  }

  let inProgress = 0;
  let complete = 0;
  for (const lite of preStatusLite) {
    if (lite.statusKind === 'in-progress') inProgress += 1;
    else complete += 1;
  }
  const statusCounts = { all: preStatusLite.length, inProgress, complete };

  const statusFilter = params.statuses;
  const filtered =
    statusFilter && statusFilter.length > 0
      ? preStatusLite.filter((lite) => statusFilter.includes(lite.statusKind))
      : preStatusLite;

  const sorted = sortLite(filtered, params.sort);
  const start = params.page * params.pageSize;
  const rows = sorted.slice(start, start + params.pageSize);

  return { rows, totalCount: filtered.length, statusCounts };
}

export async function queryMatchingSessionIds(
  params: SessionQueryParams,
): Promise<string[]> {
  const allSessions = await db.sessions.toArray();
  const ids: string[] = [];
  const statusFilter = params.statuses;
  for (const session of allSessions) {
    if (!matchesNonStatusFilters(session, params)) continue;
    if (statusFilter && statusFilter.length > 0) {
      const statusKind = deriveStatusKind(session);
      if (!statusFilter.includes(statusKind)) continue;
    }
    ids.push(session.id);
  }
  return ids;
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
  isSynthetic?: boolean;
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
    isSynthetic: args.isSynthetic ?? false,
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

export async function deleteSessions(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.sessions.bulkDelete([...ids]);
}

export async function countSyntheticSessions(): Promise<number> {
  // IndexedDB does not accept booleans as keys, so we filter rather than
  // .where('isSynthetic').equals(true). The isSynthetic index still helps
  // Dexie restrict the scan to rows where the field is defined.
  return db.sessions.filter((s) => s.isSynthetic === true).count();
}

export async function deleteSyntheticSessions(): Promise<number> {
  return db.sessions.filter((s) => s.isSynthetic === true).delete();
}
