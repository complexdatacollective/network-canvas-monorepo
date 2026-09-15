import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  DENIAL_KEY_PREFIX,
  type DeniedAuditSummary,
  parseDenialWindowKey,
} from '../../audit/denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from '../../audit/denial-summary.ts';
import {
  DENIED_AUDIT_OPERATIONS,
  type DeniedAuditOperation,
} from '../../audit/events.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { DENIED_SCOPE_COUNTS_KEY } from '../../rate-limit.ts';
import type { RateLimitStore } from '../../rate-limit/store.ts';
import { logJobOutcome } from '../log.ts';
import type { HandledJob } from './job.ts';

// Turning suppressed denied attempts into the record of them (#1909).
//
// Two things accumulate in Valkey between runs and this is what drains both.
//
// The first is the audit denial window: one hash per (actor, team, operation,
// minute), holding how many attempts past the cap there were and when the
// first and last of them happened (src/audit/denial-rate-limit.ts). Each such
// window whose minute has passed becomes exactly one
// `security.denied_attempts.rate_limited` event in that team's audit log,
// written as the maintenance role — the only role that may visit a team it was
// not pinned to. This is the work that used to happen at web-process shutdown,
// where a container killed rather than stopped lost it.
//
// The second is the rate limiter's own denial counts, which are per scope and
// carry no subject at all: an address, an email or a participation link is
// what the limiter refused, and none of the three belongs in a log or in an
// audit event. Those scopes also mostly have no team to write into — a
// refused sign-in is refused before anyone knows who it was. So they are
// summarised as one log line per scope per run, which says how many were
// refused and nothing about whom.

const QUEUE = 'denied-attempts-summary';

/** How long a finished window waits before this job will take it. */
const DEFAULT_WINDOW_MS = 60_000;

/**
 * A window is taken a second after it closes rather than the moment it does.
 * The bucket is chosen from each API process's own clock, so a process running
 * slightly behind can still be writing into the minute that has just ended
 * here; a second of margin means its record is in the hash before the hash is
 * read, rather than becoming a second summary on the next run.
 */
const CLOSE_MARGIN_MS = 1_000;

/** `SCAN` is cursor-based; this is how much of the keyspace one call covers. */
const SCAN_COUNT = 500;

/**
 * Reads a suppression hash and removes it in one execution, so that the worker
 * which got the contents is the only one that can write its summary. pg-boss's
 * `singleton` policy already keeps two runs from overlapping; this makes the
 * guarantee the key's rather than the queue's, which is what holds when a
 * schedule is fired twice or a run is retried by hand.
 */
const CLAIM_SCRIPT = `
local reply = redis.call('HGETALL', KEYS[1])
if #reply == 0 then return {} end
redis.call('DEL', KEYS[1])
return reply
`;

export type DeniedAttemptsSummaryHandlerDeps = {
  /**
   * Cross-team writes are the maintenance role's alone, and a summary is by
   * construction a write into a team no request pinned.
   */
  maintenancePool: pg.Pool;
  /** Absent means no store is configured; there is then nothing to summarise. */
  store?: RateLimitStore | undefined;
  /** The suites give each file its own prefix and a shorter window. */
  keyPrefix?: string;
  windowMs?: number;
};

/** `HGETALL`'s flat reply, as Lua returns it. */
function readHash(reply: unknown): Map<string, string> | null {
  if (!Array.isArray(reply)) return null;
  const fields = new Map<string, string>();
  for (let index = 0; index + 1 < reply.length; index += 2) {
    const field = reply[index];
    const value = reply[index + 1];
    if (typeof field !== 'string' || typeof value !== 'string') return null;
    fields.set(field, value);
  }
  return fields;
}

function readSummary(fields: Map<string, string>): DeniedAuditSummary | null {
  const suppressedCount = Number(fields.get('suppressed') ?? '0');
  const firstSuppressedAt = Number(fields.get('first'));
  const lastSuppressedAt = Number(fields.get('last'));
  if (!Number.isSafeInteger(suppressedCount) || suppressedCount <= 0) {
    return null;
  }
  if (
    !Number.isSafeInteger(firstSuppressedAt) ||
    !Number.isSafeInteger(lastSuppressedAt)
  ) {
    return null;
  }
  return { suppressedCount, firstSuppressedAt, lastSuppressedAt };
}

function isDeniedAuditOperation(
  operation: string,
): operation is DeniedAuditOperation {
  return (DENIED_AUDIT_OPERATIONS as readonly string[]).includes(operation);
}

/**
 * The actor the suppressed attempts belonged to. The audit event carries the
 * actor's label, and the label is derived from the user row rather than stored
 * in Valkey: a name and an email address are exactly what the limiter's own
 * keys are hashed to keep out of that store, and the same rule holds here.
 */
async function loadActor(
  pool: pg.Pool,
  actorId: string,
): Promise<SessionPrincipal | null> {
  const rows = await pool.query<{
    name: string;
    email: string;
    emailVerified: boolean;
  }>(`SELECT name, email, "emailVerified" FROM "user" WHERE id = $1`, [
    actorId,
  ]);
  const row = rows.rows[0];
  if (!row) return null;
  return {
    kind: 'user',
    userId: actorId,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    locale: null,
    // Nothing on the write path reads it, and there is no session to name:
    // the attempts this summarises were made in sessions that ended before
    // the window did.
    sessionId: '',
  };
}

export function createDeniedAttemptsSummaryHandler(
  deps: DeniedAttemptsSummaryHandlerDeps,
): (jobs: HandledJob[]) => Promise<void> {
  const prefix = deps.keyPrefix ?? DENIAL_KEY_PREFIX;
  const windowMs = deps.windowMs ?? DEFAULT_WINDOW_MS;

  /** Every suppression key there is, read a page at a time. */
  const scanWindowKeys = async (store: RateLimitStore): Promise<string[]> => {
    const found: string[] = [];
    let cursor = '0';
    do {
      const page = await store.run((redis) =>
        redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', SCAN_COUNT),
      );
      // An unreachable store mid-scan ends the pass; the keys outlive their
      // window by minutes, so the next run takes what this one did not.
      if (!Array.isArray(page) || page.length !== 2) break;
      const [next, keys] = page;
      if (typeof next !== 'string' || !Array.isArray(keys)) break;
      for (const key of keys) if (typeof key === 'string') found.push(key);
      cursor = next;
    } while (cursor !== '0');
    return found;
  };

  const writeSummary = async (
    teamId: string,
    operation: DeniedAuditOperation,
    actor: SessionPrincipal,
    summary: DeniedAuditSummary,
  ): Promise<void> => {
    await createDeniedAuditSummaryWriter(
      {
        tenantDb: createTenantDb(deps.maintenancePool, teamId),
        principal: actor,
        requestId: randomUUID(),
      },
      operation,
    )(summary);
  };

  const summariseWindows = async (store: RateLimitStore): Promise<number> => {
    const closedBefore = Date.now() - CLOSE_MARGIN_MS;
    let written = 0;
    for (const key of await scanWindowKeys(store)) {
      const window = parseDenialWindowKey(key, prefix);
      if (!window) continue;
      if (window.windowStart + windowMs > closedBefore) continue;

      const claimed = await store.run((redis) =>
        redis.eval(CLAIM_SCRIPT, 1, key),
      );
      const fields = readHash(claimed);
      if (!fields || fields.size === 0) continue;
      const summary = readSummary(fields);
      // A window that reached its cap but suppressed nothing is a window whose
      // denials were all recorded as events already; there is nothing to say.
      if (!summary) continue;

      if (!isDeniedAuditOperation(window.operation)) {
        // A key this build does not know the operation of — an older release's
        // name, or a hand-written key. Dropped rather than written, because the
        // event schema enumerates the operation.
        // oxlint-disable-next-line no-console -- background worker diagnostics
        console.error(
          `Discarding a denied-attempts summary for unknown operation ${JSON.stringify(window.operation)}.`,
        );
        continue;
      }
      const actor = await loadActor(deps.maintenancePool, window.actorId);
      if (!actor) {
        // The account was deleted between the attempts and this run. The event
        // requires the actor's label and there is nowhere left to read it.
        // oxlint-disable-next-line no-console -- background worker diagnostics
        console.error(
          `Discarding a denied-attempts summary for a user that no longer exists (team ${window.teamId}).`,
        );
        continue;
      }

      try {
        await writeSummary(window.teamId, window.operation, actor, summary);
        written += 1;
      } catch (error) {
        // The key is already gone, so this summary is lost rather than
        // retried — the same posture the shutdown flush it replaces took, and
        // the signal is the one that path emitted.
        process.emitWarning(
          'A denied-attempts summary could not be appended to the audit log.',
          {
            type: 'StudioAuditWarning',
            code: 'STUDIO_DENIED_AUDIT_SUMMARY_FAILED',
            detail: JSON.stringify({
              teamId: window.teamId,
              operation: window.operation,
              suppressedCount: summary.suppressedCount,
              cause: error instanceof Error ? error.message : String(error),
            }),
          },
        );
      }
    }
    return written;
  };

  const summariseScopes = async (store: RateLimitStore): Promise<number> => {
    const claimed = await store.run((redis) =>
      redis.eval(CLAIM_SCRIPT, 1, DENIED_SCOPE_COUNTS_KEY),
    );
    const fields = readHash(claimed);
    if (!fields) return 0;
    for (const [scope, count] of fields) {
      // oxlint-disable-next-line no-console -- abuse diagnostics
      console.warn(`Rate limit refused ${count} call(s) in scope ${scope}.`);
    }
    return fields.size;
  };

  return async (jobs) => {
    for (const job of jobs) {
      const attempt = job.retryCount + 1;
      const store = deps.store;
      if (!store) {
        logJobOutcome({
          queue: QUEUE,
          jobId: job.id,
          outcome: 'completed',
          attempt,
          detail: 'no rate limit store is configured',
        });
        continue;
      }
      try {
        const events = await summariseWindows(store);
        const scopes = await summariseScopes(store);
        logJobOutcome({
          queue: QUEUE,
          jobId: job.id,
          outcome: 'completed',
          attempt,
          detail: `summary events ${events}, limiter scopes ${scopes}`,
        });
      } catch (error) {
        // Nothing retries: the keys outlive their window by minutes and the
        // next minute's run takes whatever this one left.
        logJobOutcome({
          queue: QUEUE,
          jobId: job.id,
          outcome: 'failed',
          attempt,
          error,
        });
        throw error;
      }
    }
  };
}
