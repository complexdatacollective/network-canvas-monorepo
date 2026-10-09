import { v4 as uuid } from 'uuid';

import {
  getInterviewProgress,
  getLastAvailableAuthoredStageIndex,
  type ProtocolLocaleChange,
  type SessionFinish,
} from '@codaco/interview';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import { db } from './db';
import {
  decryptSession,
  decryptSessionRecord,
  encryptSession,
  type StoredSessionRow,
  prepareSessionFinish,
  withoutSessionFinish,
  withSessionFinish,
} from './recordCrypto';
import type {
  SessionQueryParams,
  SessionQueryResult,
  SessionStatusKind,
  StoredSession,
  StoredSessionLite,
  StoredSessionPatch,
} from './types';

// Status reflects interview *completion*, not export. `finishedAt` is the
// authoritative completion signal; export is tracked separately (exportedAt,
// surfaced by the dedicated Export status column) so an exported but unfinished
// session still reads in-progress and keeps its Resume affordance.
function deriveStatusKind(session: StoredSessionRow): SessionStatusKind {
  if (session.finishedAt) return 'complete';
  return 'in-progress';
}

// The interview engine reports participant-facing progress via onStepChange; we persist it on the session and
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
  collator: Intl.Collator,
): number {
  if (column === 'caseId') return collator.compare(a.caseId, b.caseId);
  if (column === 'protocolName') {
    return collator.compare(a.protocolName, b.protocolName);
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
  locale: string,
): StoredSessionLite[] {
  const directionMultiplier = sort.direction === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(locale);
  return rows.toSorted((a, b) => {
    const primary =
      compareLite(a, b, sort.column, collator) * directionMultiplier;
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

  const sorted = sortLite(filtered, params.sort, params.locale ?? 'en');
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

export function getSession(id: string): Promise<StoredSession | undefined> {
  // This read joins the per-id mutation chain (below) so it can never overtake
  // a write already enqueued in this tab. The interview Shell hands its final
  // autosave to updateSession while unmounting on exit; a prompt resume's
  // hydration read must wait for that write — hydrating from the pre-write row
  // would render without the participant's latest answers, and the engine's
  // next autosave would persist that stale network back over the newer stored
  // record, silently destroying data.
  return enqueueSessionMutation(id, async () => {
    const row = await db.sessions.get(id);
    return row ? decryptSession(row) : undefined;
  });
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
    localePreference: null,
    locale: null,
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
// trailing sync can't clobber a completion/export marker. getSession joins
// the same chain so a single-session read observes every write this tab has
// already enqueued (read-your-writes; see the comment on getSession).
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

/**
 * Resolve once every session mutation enqueued so far has settled.
 *
 * These mutations read the vault key when they RUN, not when they are queued:
 * `updateSession` waits its turn on the chain above, reads the stored row and
 * decrypts it, and only then reaches `encryptSession`. Clearing the key while
 * any of that is outstanding makes it fail closed and loses the answers it was
 * carrying, so the idle lock waits for this first — see `AuthContext`.
 *
 * An empty queue is not the same as a quiet pipeline. The route's sync handler
 * batches (`createDebouncedSyncHandler`), so while one write is in flight a
 * newer answer is held in the handler rather than queued here — and released on
 * a zero-delay timer once that write lands. For an instant the queue is empty
 * with an answer still one tick from entering it, and concluding "quiet" there
 * clears the key out from under it. So yield a macrotask before believing an
 * empty queue: the handler's timer was scheduled first and therefore runs
 * first. This holds because that handler's window is zero; a host that held
 * answers for longer would need the lock to wait on the handler itself.
 *
 * Bounded: a mutation already in flight can land while we wait, so re-check,
 * but never indefinitely. The caller is entitled to proceed, and puts its own
 * deadline around this as well.
 */
export async function whenSessionWritesSettle(): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    // allSettled: a failed write is still a settled one, and this is a wait,
    // not a retry.
    await Promise.allSettled(updateChains.values());
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    if (updateChains.size === 0) return;
  }
}

/**
 * The protocol a session write was computed against. A session's network,
 * stage metadata and resume position are in its protocol's schema, and its
 * progress and stage override are positions in that protocol's stages, so a
 * write naming them is only meaningful against the protocol it was computed
 * from.
 */
export type SessionWriteBasis = { protocolHash: string };

/**
 * The stored session has moved to another protocol since the write was
 * computed — the launch migration, possibly in another tab, re-keyed it and
 * carried its data across — and the write changes only part of what it holds
 * in that protocol's schema. Applied to the migrated data, it would mix
 * schemas (an old resume position over a migrated network), so nothing is
 * written. Reload the session to continue from the migrated data.
 */
export class SessionProtocolChangedError extends Error {
  constructor(id: string) {
    super(
      `Interview ${id} moved to another protocol version after this change was made, so the change was not saved.`,
    );
    this.name = 'SessionProtocolChangedError';
  }
}

// Everything a session holds in its protocol's schema. A patch carrying all
// three is the session's whole state as its writer saw it.
const FULL_STATE_FIELDS = ['network', 'stageMetadata', 'currentStep'] as const;
// Everything that means something only against one protocol's stages.
const PROTOCOL_BOUND_FIELDS = [
  ...FULL_STATE_FIELDS,
  'progress',
  'resumeStageOverrideIndex',
] as const;

type FullStatePatch = StoredSessionPatch &
  Pick<StoredSession, 'network' | 'currentStep'> & {
    stageMetadata: StoredSession['stageMetadata'];
  };

const isFullState = (patch: StoredSessionPatch): patch is FullStatePatch =>
  FULL_STATE_FIELDS.every((field) => Object.hasOwn(patch, field));

const isProtocolBound = (patch: StoredSessionPatch) =>
  PROTOCOL_BOUND_FIELDS.some((field) => Object.hasOwn(patch, field));

/**
 * Apply `patch`, computed against the protocol `basis` names, to a stored
 * session.
 *
 * No session may point at a protocol whose schema its data is not in. When
 * the stored session still belongs to `basis.protocolHash`, the patch is
 * applied as it always was. When the launch migration has since moved it to
 * another protocol (a tab kept running while another updated the app and
 * migrated the protocol):
 *
 * - a patch with the session's whole state (network, stage metadata and
 *   resume position) replaces it under the writer's protocol hash, so the
 *   data and the hash agree. The next launch carries it across the migration
 *   again, following the durable re-keying records (`migrateStoredProtocols`),
 *   and nothing the participant did is lost.
 * - any other patch that names something protocol-bound is refused with
 *   `SessionProtocolChangedError`, and nothing is written.
 *
 * A patch naming nothing protocol-bound (for example only `finishedAt`) is
 * applied whichever protocol the session belongs to now.
 */
export function updateSession(
  id: string,
  patch: StoredSessionPatch,
  basis: SessionWriteBasis,
): Promise<StoredSession | undefined> {
  return enqueueSessionMutation(id, async () => {
    const existingRow = await db.sessions.get(id);
    if (!existingRow) return undefined;
    const full = isFullState(patch);
    const partialBound = !full && isProtocolBound(patch);
    if (partialBound && existingRow.protocolHash !== basis.protocolHash) {
      throw new SessionProtocolChangedError(id);
    }
    let updated: StoredSession;
    if (full) {
      // The whole state comes from the patch, so the stored data is not
      // parsed: once migrated, it can be in a schema this build cannot read.
      const {
        network: _network,
        stageMetadata: _stageMetadata,
        ...record
      } = await decryptSessionRecord(existingRow);
      updated = {
        ...record,
        ...patch,
        lastUpdatedAt: new Date().toISOString(),
      };
    } else {
      updated = {
        ...(await decryptSession(existingRow)),
        ...patch,
        lastUpdatedAt: new Date().toISOString(),
      };
    }
    const row = await encryptSession(updated);
    // The read above happened before the crypto awaits, and the per-id chain
    // only serialises THIS tab. In the gap, the launch-time protocol
    // migration — possibly in another tab — may have moved this session to
    // another protocol, or the session may have been deleted. Decide against
    // the freshest stored row, and drop the write entirely rather than
    // resurrect a deleted session. The locale fields are committed from it
    // too: only `setSessionLocale` writes them, and another tab may have just
    // done so.
    return db.transaction('rw', db.sessions, async () => {
      const latest = await db.sessions.get(id);
      if (!latest) return undefined;
      if (partialBound && latest.protocolHash !== basis.protocolHash) {
        throw new SessionProtocolChangedError(id);
      }
      const owned = {
        protocolHash: full ? basis.protocolHash : latest.protocolHash,
        localePreference: latest.localePreference,
        locale: latest.locale,
      };
      await db.sessions.put({ ...row, ...owned });
      return { ...updated, ...owned };
    });
  });
}

// Joins the per-id chain, so a participant's language changes are stored in
// the order they were made.
//
// `lastUpdatedAt` is left alone: the interview records the language it shows
// as soon as it opens, and a language is not interview data. Advancing the
// timestamp would make merely reopening an interview, or choosing a
// language, move it ahead of interviews that were actually worked on in the
// lists that sort by it.
export function setSessionLocale(
  id: string,
  change: ProtocolLocaleChange,
): Promise<void> {
  return enqueueSessionMutation(id, async () => {
    // Plaintext fields only, so no key is needed; `update` skips a session
    // that has been deleted rather than recreating it.
    await db.sessions.update(id, {
      localePreference: change.localePreference,
      locale: change.locale,
    });
  });
}

// Records the finish the participant confirmed: when, at which finish stage,
// and that stage's outcome. The stage id and outcome are encrypted with the
// network, so this needs the key, like any write of answers.
//
// The finish is encrypted before the write and then applied to the row as it
// stands inside the transaction, changing nothing else, so a launch-time
// migration another tab made in the meantime is kept: its network, stage
// metadata, resume position and protocol hash all stay as it wrote them.
// Stage ids survive a migration, so the recorded finish stage still names
// the same stage.
//
// `signal` aborts when the interview recording the finish is torn down. It is
// checked again inside the transaction that writes the finish, after every
// wait for the queue, the key and the database, so an interview that will
// never show its completed state is never stored as finished; an aborted
// finish rejects with the signal's reason and writes nothing.
export function markSessionFinished(
  id: string,
  finish: SessionFinish,
  signal?: AbortSignal,
): Promise<void> {
  return enqueueSessionMutation(id, async () => {
    // A row whose storage changed between encrypted and plaintext while the
    // finish was being prepared is prepared again.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      signal?.throwIfAborted();
      const existingRow = await db.sessions.get(id);
      if (!existingRow) return;
      const prepared = await prepareSessionFinish(existingRow, finish);
      const recorded = await db.transaction('rw', db.sessions, async () => {
        // Throwing here aborts the transaction before anything is put.
        signal?.throwIfAborted();
        const latest = await db.sessions.get(id);
        // A session deleted in the gap stays deleted.
        if (!latest) return true;
        const updated = withSessionFinish(latest, prepared);
        if (!updated) return false;
        const now = new Date().toISOString();
        await db.sessions.put({
          ...updated,
          finishedAt: now,
          lastUpdatedAt: now,
        });
        return true;
      });
      if (recorded) return;
    }
    throw new Error(`Could not record the finish of interview ${id}`);
  });
}

/**
 * Reopen a finished session at its last available stage of `stages`, the
 * stages of the protocol `basis` names. Refused with
 * `SessionProtocolChangedError` if the session has since moved to another
 * protocol, as a resume position in one protocol's stages means nothing in
 * another's (see `updateSession`).
 */
export function markSessionUnfinished(
  id: string,
  stages: CurrentProtocol['stages'],
  basis: SessionWriteBasis,
): Promise<void> {
  return enqueueSessionMutation(id, async () => {
    const existingRow = await db.sessions.get(id);
    if (!existingRow?.finishedAt) return;
    if (existingRow.protocolHash !== basis.protocolHash) {
      throw new SessionProtocolChangedError(id);
    }

    const existing = await decryptSession(existingRow);
    const lastAvailableStage = getLastAvailableAuthoredStageIndex(
      stages,
      existing.network,
    );
    const currentStep = lastAvailableStage ?? 0;
    const { progress } = getInterviewProgress(stages, currentStep);

    await db.transaction('rw', db.sessions, async () => {
      const latest = await db.sessions.get(id);
      if (!latest?.finishedAt) return;
      if (latest.protocolHash !== basis.protocolHash) {
        throw new SessionProtocolChangedError(id);
      }

      const now = new Date().toISOString();
      // The finish stage and outcome belong to the finish being undone, so
      // they go with it.
      await db.sessions.put({
        ...withoutSessionFinish(latest),
        finishedAt: null,
        currentStep,
        progress,
        resumeStageOverrideIndex:
          lastAvailableStage === undefined && stages.length > 0 ? 0 : undefined,
        lastUpdatedAt: now,
      });
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

// Re-encrypt every session row under the currently-held DEK, preserving every
// field value exactly (this is a re-encryption, not an update — no timestamp is
// stamped). Plaintext rows written while unconfigured gain `_enc`; rows already
// encrypted under this DEK round-trip unchanged. Each row is processed inside
// the per-id serializer so a concurrent writer can't clobber (or be clobbered
// by) the sweep, and a failure on one row rejects only that row's promise —
// callers can decide whether to continue. Precondition: a DEK must be held
// (encryptSession throws for a locked secured vault); under mode `none` this is
// a plaintext-preserving no-op and callers should not invoke it.
export async function reencryptSession(id: string): Promise<void> {
  await enqueueSessionMutation(id, async () => {
    const existingRow = await db.sessions.get(id);
    if (!existingRow) return;
    const existing = await decryptSession(existingRow);
    const row = await encryptSession(existing);
    await db.sessions.put(row);
  });
}

export async function listSessionIds(): Promise<string[]> {
  return db.sessions.orderBy('id').primaryKeys();
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
