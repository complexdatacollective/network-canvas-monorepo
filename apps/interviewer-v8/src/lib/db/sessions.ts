import { v4 as uuid } from 'uuid';

import type { NcNetwork } from '@codaco/shared-consts';

import { db } from './db';
import {
  decryptSession,
  encryptSession,
  type StoredSessionRow,
} from './recordCrypto';
import type {
  SessionQueryParams,
  SessionQueryResult,
  SessionStatusKind,
  StoredSession,
  StoredSessionLite,
} from './types';

// Status reflects interview *completion*, not export. `finishedAt` is the
// authoritative completion signal; export is tracked separately (exportedAt,
// surfaced by the dedicated Export status column) so an exported but unfinished
// session still reads in-progress and keeps its Resume affordance.
function deriveStatusKind(session: StoredSessionRow): SessionStatusKind {
  if (session.finishedAt) return 'complete';
  return 'in-progress';
}

// The interview engine reports participant-facing progress (which accounts for
// the appended finish stage) via onStepChange; we persist it on the session and
// read it straight back here. A finished session is always 100% — `progress`
// may not have been persisted for the finish step, so `finishedAt` is the
// authoritative completion signal.
export function deriveProgressPercent(session: StoredSessionRow): number {
  if (session.finishedAt) return 100;
  return Math.min(100, Math.max(0, session.progress ?? 0));
}

function toLite(session: StoredSessionRow): StoredSessionLite {
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
    progressPercent: deriveProgressPercent(session),
  };
}

export async function listSessions(): Promise<StoredSessionLite[]> {
  const rows = await db.sessions
    .orderBy('lastUpdatedAt')
    // Dexie Collection.reverse() returns a descending Collection, not an Array.
    // oxlint-disable-next-line unicorn/no-array-reverse
    .reverse()
    .toArray();
  return rows.map((session) => toLite(session));
}

// The filter bounds arrive as local 'YYYY-MM-DD' calendar dates, but row
// timestamps are true instants. `new Date('YYYY-MM-DD')` parses as UTC
// midnight, so we must build the bounds in the local frame explicitly:
// otherwise a same-day session west of UTC (or a late-evening one east of it)
// falls outside the range. Returns the local start (00:00:00.000) or end
// (23:59:59.999) instant for a calendar date, or null if malformed.
function parseLocalDayBound(day: string, edge: 'start' | 'end'): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const bound =
    edge === 'start'
      ? new Date(year, month - 1, date, 0, 0, 0, 0)
      : new Date(year, month - 1, date, 23, 59, 59, 999);
  // Reject calendar overflow: `new Date(2026, 1, 31)` silently rolls over to
  // March, so a shape-valid but out-of-range date (e.g. 2026-02-31, 2026-13-01)
  // must not become a real filter bound. The constructed date has to still
  // represent the requested Y-M-D.
  if (
    bound.getFullYear() !== year ||
    bound.getMonth() !== month - 1 ||
    bound.getDate() !== date
  ) {
    return null;
  }
  return bound;
}

function inDateRange(
  isoDate: string | null,
  range: { from: string; to: string },
): boolean {
  if (!isoDate) return false;
  const rowDate = new Date(isoDate);
  if (Number.isNaN(rowDate.getTime())) return false;
  const fromDate = parseLocalDayBound(range.from, 'start');
  const toDate = parseLocalDayBound(range.to, 'end');
  if (!fromDate || !toDate) return false;
  return rowDate >= fromDate && rowDate <= toDate;
}

function matchesNonStatusFilters(
  session: StoredSessionRow,
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

export async function querySessions(
  params: SessionQueryParams,
): Promise<SessionQueryResult> {
  const allSessions = await db.sessions.toArray();

  // Status counts use all filters except `statuses` so the chip counts
  // reflect totals within the rest of the active filter set.
  const preStatusLite: StoredSessionLite[] = [];
  for (const session of allSessions) {
    if (!matchesNonStatusFilters(session, params)) continue;
    preStatusLite.push(toLite(session));
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
  const row = await db.sessions.get(id);
  return row ? decryptSession(row) : undefined;
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  const rows = await db.sessions.bulkGet([...ids]);
  const present = rows.filter((r): r is StoredSessionRow => Boolean(r));
  return Promise.all(present.map((row) => decryptSession(row)));
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
  const row = await encryptSession(session);
  await db.sessions.put(row);
  return session;
}

// Row mutations that read-modify-write a session (get → [decrypt] → merge →
// [encrypt] → put) span async work, so overlapping calls for the same id would
// otherwise each read the pre-update row and the last writer would clobber the
// others — silently dropping network data, or reverting `finishedAt`/
// `exportedAt` set by a mark that landed in the gap. A Dexie 'rw' transaction
// can't safely hold across the crypto awaits (it auto-commits once the
// microtask queue drains with no live IndexedDB request), so instead every
// per-id mutation goes through one promise chain keyed by id: each waits for
// the previous one on the same id to settle before it reads. This serialises
// updateSession against markSessionFinished/markSessionsExported too, so a
// trailing sync can't clobber a completion/export marker.
const updateChains = new Map<string, Promise<unknown>>();

function enqueueSessionMutation<T>(
  id: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = updateChains.get(id) ?? Promise.resolve();
  const next = previous.then(run, run);
  updateChains.set(id, next);
  // Once this is the tail of the chain, drop the entry so the map doesn't grow
  // without bound; a newer mutation replaces the entry before this runs. The
  // trailing `.catch` keeps a rejected `run` from surfacing as an unhandled
  // rejection here — the caller still receives (and handles) it via `next`.
  void next
    .finally(() => {
      if (updateChains.get(id) === next) updateChains.delete(id);
    })
    .catch(() => {});
  return next;
}

export function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  return enqueueSessionMutation(id, async () => {
    const existingRow = await db.sessions.get(id);
    if (!existingRow) return undefined;
    const existing = await decryptSession(existingRow);
    const updated: StoredSession = {
      ...existing,
      ...patch,
      lastUpdatedAt: new Date().toISOString(),
    };
    const row = await encryptSession(updated);
    await db.sessions.put(row);
    return updated;
  });
}

export function markSessionFinished(id: string): Promise<void> {
  return enqueueSessionMutation(id, async () => {
    const existing = await db.sessions.get(id);
    if (!existing) return;
    // Only plaintext index fields change; spread preserves `_enc` — no key
    // needed.
    await db.sessions.put({
      ...existing,
      finishedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    });
  });
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      enqueueSessionMutation(id, async () => {
        const existing = await db.sessions.get(id);
        if (!existing) return;
        // Stamp inside the queued mutation, not before: if this is queued behind
        // an in-flight updateSession, a timestamp captured earlier could write an
        // older lastUpdatedAt than the mutation that actually ran first.
        const now = new Date().toISOString();
        await db.sessions.put({
          ...existing,
          exportedAt: now,
          lastUpdatedAt: now,
        });
      }),
    ),
  );
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
