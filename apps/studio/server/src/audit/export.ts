import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { ORPCError } from '@orpc/server';
import type pg from 'pg';

import type { AuditActorFilter } from '@codaco/studio-rpc';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  auditExportArtifactKey,
  type AuditExportArtifactStore,
} from '../assets.ts';
import type { OutboxAdapter, OutboxLease } from '../outbox/dispatcher.ts';
import { OutboxDispatcher } from '../outbox/dispatcher.ts';
import type { OutboxObserver } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import { createAuditExportHandleProtection } from '../pii/protection.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';
import {
  auditActorEventContext,
  type AuditedCommandContext,
  runAuditedCommand,
  runAuditedSystemMutation,
} from './command.ts';
import type { AuditEventInput } from './events.ts';
import { AUDIT_EVENT_REGISTRY } from './events.ts';
import { AuditReadDeniedError } from './read-authorization.ts';
import { runNoAuditTenantTransaction } from './transaction.ts';

const DIRECT_ROWS = 1_000;
const DIRECT_BYTES = 1024 * 1024;
const STAGED_ROWS = 100_000;
const STAGED_BYTES = 100 * 1024 * 1024;
const PAGE_ROWS = 250;
const HANDLE_TTL_MS = 15 * 60_000;
const ARTIFACT_EFFECT_TIMEOUT_MS = 15 * 60_000;
const ARTIFACT_CLEANUP_LEASE_MS = 30_000;
const ARTIFACT_CLEANUP_TIMEOUT_MS = 25_000;
const ARTIFACT_SWEEP_BASE_MS = 60_000;
const ARTIFACT_SWEEP_MAX_MS = 24 * 60 * 60_000;
const teamStore = new TeamStore();

export type AuditExportFilters = {
  categories?: readonly string[];
  eventTypes?: readonly string[];
  actor?: AuditActorFilter;
  outcomes?: readonly string[];
  from?: Date;
  to?: Date;
};

type ExportRow = {
  id: string;
  sequence: string;
  occurred_at: Date;
  event_type: string;
  event_version: number;
  category: string;
  outcome: string;
  actor_kind: string;
  actor_id: string | null;
  actor_label: string;
  subject_type: string | null;
  subject_id: string | null;
  subject_label: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_label: string | null;
  request_id: string;
  details: Record<string, unknown>;
};

const HEADER =
  [
    'id',
    'sequence',
    'occurred_at',
    'event_type',
    'event_version',
    'category',
    'outcome',
    'actor_kind',
    'actor_id',
    'actor_label',
    'subject_type',
    'subject_id',
    'subject_label',
    'resource_type',
    'resource_id',
    'resource_label',
    'request_id',
    'details',
  ].join(',') + '\r\n';

function csvCell(value: unknown): string {
  const raw =
    value === null
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'string'
          ? value
          : typeof value === 'number' ||
              typeof value === 'boolean' ||
              typeof value === 'bigint'
            ? String(value)
            : (JSON.stringify(value) ?? '');
  const safe = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvRow(row: ExportRow): string {
  const definition = (
    AUDIT_EVENT_REGISTRY as Record<
      string,
      | {
          detailFields: readonly string[];
          sensitiveFields: readonly string[];
        }
      | undefined
    >
  )[`${row.event_type}@${row.event_version}`];
  const details = definition
    ? Object.fromEntries(
        definition.detailFields
          .filter((field) => !definition.sensitiveFields.includes(field))
          .filter((field) => Object.hasOwn(row.details, field))
          .map((field) => [field, row.details[field]]),
      )
    : {};
  return (
    [
      row.id,
      row.sequence,
      row.occurred_at,
      row.event_type,
      row.event_version,
      row.category,
      row.outcome,
      row.actor_kind,
      row.actor_id,
      row.actor_label,
      row.subject_type,
      row.subject_id,
      row.subject_label,
      row.resource_type,
      row.resource_id,
      row.resource_label,
      row.request_id,
      details,
    ]
      .map(csvCell)
      .join(',') + '\r\n'
  );
}

function filterSql(
  teamId: string,
  highWater: string,
  filters: AuditExportFilters,
  afterSequence: string,
  limit: number,
) {
  const params: unknown[] = [teamId, highWater, afterSequence];
  const clauses: string[] = [];
  const add = (value: unknown, sql: (p: string) => string) => {
    params.push(value);
    clauses.push(`AND ${sql(`$${params.length}`)}`);
  };
  if (filters.categories?.length)
    add(filters.categories, (p) => `category = ANY(${p})`);
  if (filters.eventTypes?.length)
    add(filters.eventTypes, (p) => `event_type = ANY(${p})`);
  if (filters.actor) {
    add(filters.actor.kind, (p) => `actor_kind = ${p}`);
    if (filters.actor.id === null) clauses.push('AND actor_id IS NULL');
    else add(filters.actor.id, (p) => `actor_id = ${p}`);
  }
  if (filters.outcomes?.length)
    add(filters.outcomes, (p) => `outcome = ANY(${p})`);
  if (filters.from) add(filters.from, (p) => `occurred_at >= ${p}`);
  if (filters.to) add(filters.to, (p) => `occurred_at < ${p}`);
  params.push(limit);
  return {
    params,
    clauses: clauses.join('\n'),
    limitParam: `$${params.length}`,
  };
}

async function page(
  client: pg.PoolClient,
  teamId: string,
  highWater: string,
  filters: AuditExportFilters,
  afterSequence: string,
  limit: number,
) {
  const query = filterSql(teamId, highWater, filters, afterSequence, limit);
  return (
    await client.query<ExportRow>(
      `SELECT id, sequence::text, occurred_at,
    event_type, event_version, category, outcome, actor_kind, actor_id, actor_label,
    subject_type, subject_id, subject_label, resource_type, resource_id,
    resource_label, request_id, details FROM audit_events
    WHERE team_id = $1 AND sequence <= $2::bigint AND sequence > $3::bigint
    ${query.clauses} ORDER BY audit_events.sequence ASC LIMIT ${query.limitParam}`,
      query.params,
    )
  ).rows;
}

async function collectDirect(
  client: pg.PoolClient,
  teamId: string,
  highWater: string,
  filters: AuditExportFilters,
) {
  const rows = await page(
    client,
    teamId,
    highWater,
    filters,
    '0',
    DIRECT_ROWS + 1,
  );
  let csv = HEADER;
  for (const row of rows) {
    csv += csvRow(row);
    if (Buffer.byteLength(csv) > DIRECT_BYTES)
      return {
        direct: null,
        preflightRowCount: rows.indexOf(row) + 1,
        preflightByteCount: Buffer.byteLength(csv),
      };
  }
  return rows.length > DIRECT_ROWS
    ? {
        direct: null,
        preflightRowCount: rows.length,
        preflightByteCount: Buffer.byteLength(csv),
      }
    : {
        direct: { csv, rowCount: rows.length },
        preflightRowCount: rows.length,
        preflightByteCount: Buffer.byteLength(csv),
      };
}

function startedEvent(
  context: Parameters<typeof auditActorEventContext>[0],
  jobId: string,
  mode: 'direct' | 'staged',
  highWater: string,
  filters: AuditExportFilters,
  preflight: Awaited<ReturnType<typeof collectDirect>>,
): AuditEventInput {
  const serializedFilters: Record<string, unknown> = {
    ...(filters.categories ? { categories: [...filters.categories] } : {}),
    ...(filters.eventTypes ? { eventTypes: [...filters.eventTypes] } : {}),
    ...(filters.actor
      ? { actor: { kind: filters.actor.kind, id: filters.actor.id } }
      : {}),
    ...(filters.outcomes ? { outcomes: [...filters.outcomes] } : {}),
    ...(filters.from ? { from: filters.from.toISOString() } : {}),
    ...(filters.to ? { to: filters.to.toISOString() } : {}),
  };
  const details =
    mode === 'direct' && preflight.direct
      ? {
          deliveryMode: mode,
          highWaterSequence: highWater,
          filters: serializedFilters,
          rowLimit: DIRECT_ROWS,
          byteLimit: DIRECT_BYTES,
          rowCount: preflight.direct.rowCount,
          byteCount: preflight.preflightByteCount,
        }
      : {
          deliveryMode: 'staged' as const,
          highWaterSequence: highWater,
          filters: serializedFilters,
          rowLimit: STAGED_ROWS,
          byteLimit: STAGED_BYTES,
          preflightRowCount: preflight.preflightRowCount,
          preflightByteCount: preflight.preflightByteCount,
        };
  return {
    ...auditActorEventContext(context),
    eventVersion: 1,
    eventType: 'audit.export.started',
    category: 'audit',
    outcome: 'succeeded',
    subjectType: 'audit_export',
    subjectId: jobId,
    subjectLabel: null,
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    details,
  };
}

type AuditExportRequestResult =
  | { deliveryMode: 'direct'; csv: string; rowCount: number }
  | {
      deliveryMode: 'staged';
      jobId: string;
      status: 'pending' | 'generating';
    };

export async function requestAuditExport(
  context: AuditedCommandContext,
  filters: AuditExportFilters,
  options: { stagedAvailable: boolean },
): Promise<AuditExportRequestResult> {
  const immutableFilters: AuditExportFilters = Object.freeze({
    ...(filters.categories
      ? { categories: Object.freeze([...filters.categories]) }
      : {}),
    ...(filters.eventTypes
      ? { eventTypes: Object.freeze([...filters.eventTypes]) }
      : {}),
    ...(filters.actor ? { actor: Object.freeze({ ...filters.actor }) } : {}),
    ...(filters.outcomes
      ? { outcomes: Object.freeze([...filters.outcomes]) }
      : {}),
    ...(filters.from ? { from: new Date(filters.from) } : {}),
    ...(filters.to ? { to: new Date(filters.to) } : {}),
  });
  return runAuditedCommand<AuditExportRequestResult>(
    context,
    async (client, locked) => {
      const actor = await teamStore.lockActor(
        client,
        context.tenantDb.teamId,
        context.principal.userId,
      );
      if (!actor) throw new ORPCError('FORBIDDEN');
      if (!roleGrantsTeamAdministration(actor.role))
        throw new AuditReadDeniedError();
      const high = await client.query<{ sequence: string }>(
        `SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM audit_events WHERE team_id = $1`,
        [context.tenantDb.teamId],
      );
      const highWater = high.rows[0]?.sequence ?? '0';
      const preflight = await collectDirect(
        client,
        context.tenantDb.teamId,
        highWater,
        immutableFilters,
      );
      const direct = preflight.direct;
      if (!direct && !options.stagedAvailable)
        throw new ORPCError('SERVICE_UNAVAILABLE');
      const jobId = randomUUID();
      const mode = direct ? 'direct' : 'staged';
      return {
        status: 'succeeded' as const,
        result: direct
          ? { deliveryMode: 'direct' as const, ...direct }
          : {
              deliveryMode: 'staged' as const,
              jobId,
              status: 'pending' as const,
            },
        events: [
          startedEvent(
            locked,
            jobId,
            mode,
            highWater,
            immutableFilters,
            preflight,
          ),
        ],
        afterEventsStored: async (transaction, events) => {
          if (direct) return;
          const start = events[0];
          await transaction.query(
            `INSERT INTO audit_export_jobs
          (id, team_id, actor_kind, actor_id, start_event_id, start_event_sequence,
           high_water_sequence, filters, row_limit, byte_limit,
           preflight_row_count, preflight_byte_count)
          VALUES ($1,$2,'user',$3,$4,$5::bigint,$6::bigint,$7::jsonb,$8,$9,$10,$11)`,
            [
              jobId,
              context.tenantDb.teamId,
              context.principal.userId,
              start.id,
              start.sequence,
              highWater,
              JSON.stringify(immutableFilters),
              STAGED_ROWS,
              STAGED_BYTES,
              preflight.preflightRowCount,
              preflight.preflightByteCount,
            ],
          );
        },
      };
    },
  );
}

async function authorizedExportRow(
  context: AuditedCommandContext,
  jobId: string,
) {
  return runNoAuditTenantTransaction(
    context.tenantDb,
    'audit.export.status',
    async (client) => {
      const actor = await teamStore.lockActor(
        client,
        context.tenantDb.teamId,
        context.principal.userId,
      );
      if (!actor) throw new ORPCError('FORBIDDEN');
      if (!roleGrantsTeamAdministration(actor.role))
        throw new AuditReadDeniedError();
      const row = await client.query<{
        status: 'pending' | 'generating' | 'ready' | 'failed';
        actor_id: string;
        handle_ciphertext: Buffer | null;
        handle_key_id: string | null;
        handle_algorithm: string | null;
        handle_expires_at: Date | null;
        handle_consumed_at: Date | null;
        artifact_key: string | null;
      }>(
        `SELECT status,actor_id,handle_ciphertext,handle_key_id,handle_algorithm,
       handle_expires_at,handle_consumed_at,artifact_key FROM audit_export_jobs
       WHERE id=$1 AND team_id=$2`,
        [jobId, context.tenantDb.teamId],
      );
      const job = row.rows[0];
      if (!job || job.actor_id !== context.principal.userId)
        throw new ORPCError('NOT_FOUND');
      return job;
    },
  );
}

export async function readAuditExportStatus(
  context: AuditedCommandContext,
  jobId: string,
  keys: EncryptionKeys,
) {
  const job = await authorizedExportRow(context, jobId);
  if (job.status !== 'ready') return { status: job.status } as const;
  if (
    job.handle_consumed_at ||
    !job.handle_expires_at ||
    job.handle_expires_at <= new Date()
  )
    return { status: 'failed' as const };
  if (!job.handle_ciphertext || !job.handle_key_id || !job.handle_algorithm)
    throw new Error('invalid ready audit export');
  const plaintext = createAuditExportHandleProtection(keys).open(
    {
      kind: 'audit_export',
      teamId: context.tenantDb.teamId,
      actorId: context.principal.userId,
      jobId,
      column: 'handle_ciphertext',
    },
    {
      envelope: job.handle_ciphertext,
      keyId: job.handle_key_id,
      algorithm: job.handle_algorithm,
    },
  );
  try {
    return {
      status: 'ready' as const,
      handle: plaintext.toString('base64url'),
      expiresAt: job.handle_expires_at,
      downloadPath: `/audit-exports/${encodeURIComponent(context.tenantDb.teamId)}/${jobId}`,
    };
  } finally {
    plaintext.fill(0);
  }
}

function releaseStream(stream: ReadableStream<Uint8Array>): void {
  void stream.cancel().catch(() => undefined);
}

function boundedDownloadStream(
  source: ReadableStream<Uint8Array>,
  expectedBytes: number,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let bytes = 0;
  let released = false;
  const releaseReader = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          if (bytes !== expectedBytes)
            throw new Error('stored audit export size mismatch');
          controller.close();
          releaseReader();
          return;
        }
        bytes += chunk.value.byteLength;
        if (bytes > expectedBytes || bytes > STAGED_BYTES)
          throw new Error('stored audit export exceeds limit');
        controller.enqueue(chunk.value);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        releaseReader();
        controller.error(error);
      }
    },
    cancel() {
      const cancellation = reader.cancel().catch(() => undefined);
      void cancellation.finally(releaseReader);
      return cancellation;
    },
  });
}

export async function openAuditExportDownload(
  context: AuditedCommandContext,
  jobId: string,
  handle: string,
  store: AuditExportArtifactStore,
) {
  const hash = createHash('sha256').update(handle).digest('hex');
  const available = await runNoAuditTenantTransaction(
    context.tenantDb,
    'audit.export.download.preflight',
    async (client) => {
      const actor = await teamStore.lockActor(
        client,
        context.tenantDb.teamId,
        context.principal.userId,
      );
      // The one-use download route deliberately returns the same unavailable
      // response for missing, consumed and unauthorized handles; it does not
      // use the RPC audit-read denial guard.
      if (!actor || !roleGrantsTeamAdministration(actor.role))
        throw new Error('audit export forbidden');
      return (
        await client.query<{
          artifact_key: string;
          artifact_byte_count: number;
        }>(
          `SELECT artifact_key,artifact_byte_count::int AS artifact_byte_count
           FROM audit_export_jobs
           WHERE id=$1 AND team_id=$2 AND actor_id=$3 AND status='ready'
             AND handle_hash=$4 AND handle_consumed_at IS NULL
             AND handle_expires_at>statement_timestamp()`,
          [jobId, context.tenantDb.teamId, context.principal.userId, hash],
        )
      ).rows[0];
    },
  );
  if (!available) throw new Error('audit export unavailable');
  const stored = await store.getAuditExport(available.artifact_key);
  if (!stored) throw new Error('audit export unavailable');
  let handedOff = false;
  try {
    if (
      available.artifact_byte_count > STAGED_BYTES ||
      (stored.size !== undefined &&
        stored.size !== available.artifact_byte_count)
    )
      throw new Error('audit export unavailable');
    const consumed = await runNoAuditTenantTransaction(
      context.tenantDb,
      'audit.export.consume',
      async (client) => {
        const actor = await teamStore.lockActor(
          client,
          context.tenantDb.teamId,
          context.principal.userId,
        );
        if (!actor || !roleGrantsTeamAdministration(actor.role))
          return { rowCount: 0 };
        return client.query(
          `UPDATE audit_export_jobs SET handle_consumed_at=statement_timestamp()
     WHERE id=$1 AND team_id=$2 AND actor_id=$3 AND status='ready'
       AND artifact_key=$4 AND handle_hash=$5 AND handle_consumed_at IS NULL
       AND handle_expires_at>statement_timestamp() RETURNING id`,
          [
            jobId,
            context.tenantDb.teamId,
            context.principal.userId,
            available.artifact_key,
            hash,
          ],
        );
      },
    );
    if (consumed.rowCount !== 1) throw new Error('audit export unavailable');
    const body = boundedDownloadStream(
      stored.body,
      available.artifact_byte_count,
    );
    handedOff = true;
    return { body, size: available.artifact_byte_count };
  } finally {
    if (!handedOff) releaseStream(stored.body);
  }
}

type Claim = {
  id: string;
  teamId: string;
  actorId: string;
  startEventId: string;
  highWater: string;
  filters: AuditExportFilters;
  attemptCount: number;
  leaseOwner: string;
  attemptId: string | null;
  artifactKey: string | null;
};
type Generated = {
  key: string;
  rowCount: number;
  byteCount: number;
  sealed?: {
    ciphertext: Buffer;
    keyId: string;
    algorithm: string;
    hash: string;
  };
};
type ReadyCleanupClaim = {
  id: string;
  teamId: string;
  actorId: string;
  startEventId: string;
  attemptId: string;
  artifactKey: string;
  cleanupOwner: string;
  reason: 'consumed' | 'expired';
};
type RetiredAttemptClaim = {
  attemptId: string;
  artifactKey: string;
  uploadId: string | null;
  sweepCount: number;
  cleanupOwner: string;
};

class CleanupClaimLostError extends Error {}

function generatedId(claim: Pick<Claim, 'attemptId'>): string {
  if (!claim.attemptId) throw new Error('audit export attempt missing');
  return claim.attemptId;
}

export class AuditExportAdapter implements OutboxAdapter<Claim> {
  readonly queue = 'audit_export_jobs' as const;
  private generated = new Map<string, Generated>();
  private pool: pg.Pool;
  private store: AuditExportArtifactStore;
  private keys: EncryptionKeys;
  private cleanupConsumedAfterMs: number;
  constructor(
    pool: pg.Pool,
    store: AuditExportArtifactStore,
    keys: EncryptionKeys,
    cleanupConsumedAfterMs: number,
  ) {
    this.pool = pool;
    this.store = store;
    this.keys = keys;
    this.cleanupConsumedAfterMs = cleanupConsumedAfterMs;
  }
  private forgetGenerated(c: Pick<Claim, 'attemptId'>): void {
    if (c.attemptId) this.generated.delete(c.attemptId);
  }
  private generatedFor(c: Pick<Claim, 'attemptId'>): Generated | undefined {
    return c.attemptId ? this.generated.get(c.attemptId) : undefined;
  }

  private async releaseAttemptSweep(
    claim: RetiredAttemptClaim,
    delayMs: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE audit_export_artifact_attempts SET
         sweep_count=sweep_count+1,last_sweep_at=statement_timestamp(),
         next_sweep_at=statement_timestamp()+($3*interval '1 millisecond'),
         sweep_owner=NULL,sweep_expires_at=NULL
       WHERE id=$1 AND state='retired' AND sweep_owner=$2
         AND sweep_expires_at>statement_timestamp()`,
      [claim.attemptId, claim.cleanupOwner, delayMs],
    );
    return result.rowCount === 1;
  }

  private async claimRetiredAttempt(): Promise<RetiredAttemptClaim | null> {
    const cleanupOwner = randomUUID();
    const result = await this.pool.query<RetiredAttemptClaim>(
      `WITH candidate AS (
         SELECT id FROM audit_export_artifact_attempts
         WHERE state='retired' AND next_sweep_at<=statement_timestamp()
           AND (sweep_owner IS NULL OR sweep_expires_at<=statement_timestamp())
         ORDER BY next_sweep_at,id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE audit_export_artifact_attempts attempts SET sweep_owner=$1,
         sweep_expires_at=statement_timestamp()+($2*interval '1 millisecond')
       FROM candidate WHERE attempts.id=candidate.id
       RETURNING attempts.id AS "attemptId",attempts.artifact_key AS "artifactKey",
         attempts.upload_id AS "uploadId",attempts.sweep_count AS "sweepCount",
         attempts.sweep_owner::text AS "cleanupOwner"`,
      [cleanupOwner, ARTIFACT_CLEANUP_LEASE_MS],
    );
    return result.rows[0] ?? null;
  }

  private async retireExpiredAttempt(): Promise<boolean> {
    const result = await this.pool.query(
      `WITH candidate AS (
         SELECT jobs.id, jobs.artifact_attempt_id FROM audit_export_jobs jobs
         JOIN audit_export_artifact_attempts attempts
           ON attempts.id=jobs.artifact_attempt_id AND attempts.state='active'
         WHERE jobs.status='generating'
           AND jobs.lease_expires_at<=statement_timestamp()
         ORDER BY jobs.lease_expires_at,jobs.id FOR UPDATE OF jobs SKIP LOCKED LIMIT 1
       ), retired AS (
         UPDATE audit_export_artifact_attempts attempts SET state='retired',
           retired_at=statement_timestamp(),next_sweep_at=statement_timestamp()
         FROM candidate WHERE attempts.id=candidate.artifact_attempt_id
           AND attempts.state='active' RETURNING attempts.id
       )
       UPDATE audit_export_jobs jobs SET status='pending',artifact_attempt_id=NULL,
         artifact_key=NULL,lease_owner=NULL,lease_expires_at=NULL
       FROM candidate,retired WHERE jobs.id=candidate.id
         AND jobs.artifact_attempt_id=retired.id RETURNING jobs.id`,
    );
    return result.rowCount === 1;
  }

  private async releaseReadyCleanup(claim: ReadyCleanupClaim): Promise<void> {
    await this.pool.query(
      `UPDATE audit_export_artifact_attempts SET sweep_owner=NULL,sweep_expires_at=NULL
       WHERE id=$1 AND state='active' AND sweep_owner=$2`,
      [claim.attemptId, claim.cleanupOwner],
    );
  }

  private async claimReadyCleanup(): Promise<ReadyCleanupClaim | null> {
    const cleanupOwner = randomUUID();
    const result = await this.pool.query<ReadyCleanupClaim>(
      `WITH candidate AS (
         SELECT jobs.id,jobs.artifact_attempt_id FROM audit_export_jobs jobs
         JOIN audit_export_artifact_attempts attempts
           ON attempts.id=jobs.artifact_attempt_id AND attempts.state='active'
         WHERE jobs.status='ready' AND (
           (jobs.handle_consumed_at IS NULL
             AND jobs.handle_expires_at<=statement_timestamp())
           OR (jobs.handle_consumed_at IS NOT NULL
             AND jobs.handle_consumed_at<=statement_timestamp()-($1*interval '1 millisecond'))
         ) AND (attempts.sweep_owner IS NULL
           OR attempts.sweep_expires_at<=statement_timestamp())
         ORDER BY COALESCE(jobs.handle_consumed_at,jobs.handle_expires_at),jobs.id
         FOR UPDATE OF attempts SKIP LOCKED LIMIT 1
       ), claimed AS (
         UPDATE audit_export_artifact_attempts attempts SET sweep_owner=$2,
           sweep_expires_at=statement_timestamp()+($3*interval '1 millisecond')
         FROM candidate WHERE attempts.id=candidate.artifact_attempt_id
         RETURNING attempts.id,attempts.artifact_key
       )
       SELECT jobs.id,jobs.team_id AS "teamId",jobs.actor_id AS "actorId",
         jobs.start_event_id AS "startEventId",claimed.id AS "attemptId",
         claimed.artifact_key AS "artifactKey",$2::text AS "cleanupOwner",
         CASE WHEN jobs.handle_consumed_at IS NULL THEN 'expired' ELSE 'consumed' END AS reason
       FROM audit_export_jobs jobs JOIN candidate ON candidate.id=jobs.id
       JOIN claimed ON claimed.id=candidate.artifact_attempt_id`,
      [this.cleanupConsumedAfterMs, cleanupOwner, ARTIFACT_CLEANUP_LEASE_MS],
    );
    return result.rows[0] ?? null;
  }

  private async completeReadyCleanup(
    claim: ReadyCleanupClaim,
  ): Promise<boolean> {
    const tenant = createTenantDb(this.pool, claim.teamId);
    try {
      await runAuditedSystemMutation(
        {
          tenantDb: tenant,
          actorLabel: 'Audit export',
          requestId: randomUUID(),
        },
        async (_client, ctx) => ({
          result: undefined,
          events: [
            {
              ...ctx,
              eventVersion: 1,
              eventType: 'audit.export.cleaned',
              category: 'audit',
              outcome: 'succeeded',
              subjectType: 'audit_export',
              subjectId: claim.id,
              subjectLabel: null,
              resourceType: null,
              resourceId: null,
              resourceLabel: null,
              details: {
                startEventId: claim.startEventId,
                requestedByActorId: claim.actorId,
                reason: claim.reason,
              },
            },
          ],
          afterEventsStored: async (client) => {
            const deleted = await client.query(
              `WITH retired AS (
                 UPDATE audit_export_artifact_attempts SET state='retired',
                   retired_at=statement_timestamp(),next_sweep_at=statement_timestamp(),
                   sweep_owner=NULL,sweep_expires_at=NULL
                 WHERE id=$2 AND state='active' AND artifact_key=$3
                   AND sweep_owner=$4 AND sweep_expires_at>statement_timestamp()
                 RETURNING id
               )
               DELETE FROM audit_export_jobs jobs USING retired
               WHERE jobs.id=$1 AND jobs.status='ready'
                 AND jobs.artifact_attempt_id=retired.id RETURNING jobs.id`,
              [
                claim.id,
                claim.attemptId,
                claim.artifactKey,
                claim.cleanupOwner,
              ],
            );
            if (deleted.rowCount !== 1) throw new CleanupClaimLostError();
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof CleanupClaimLostError) return false;
      throw error;
    }
  }

  async suppressUndeliverable() {
    let changed = (await this.retireExpiredAttempt()) ? 1 : 0;
    const ready = await this.claimReadyCleanup();
    if (ready) {
      try {
        if (await this.completeReadyCleanup(ready)) changed++;
      } catch (error) {
        await this.releaseReadyCleanup(ready).catch(() => undefined);
        if (!(error instanceof CleanupClaimLostError)) throw error;
      }
    }
    const claim = await this.claimRetiredAttempt();
    if (!claim) return changed;
    try {
      const settled = await this.store.cleanupAuditExport(
        claim.artifactKey,
        claim.uploadId,
        AbortSignal.timeout(ARTIFACT_CLEANUP_TIMEOUT_MS),
      );
      const exponent = Math.min(claim.sweepCount, 10);
      const delay = settled
        ? Math.min(
            ARTIFACT_SWEEP_MAX_MS,
            ARTIFACT_SWEEP_BASE_MS * 2 ** exponent,
          )
        : ARTIFACT_SWEEP_BASE_MS;
      if (!(await this.releaseAttemptSweep(claim, delay)))
        throw new CleanupClaimLostError();
      return changed + 1;
    } catch (error) {
      await this.releaseAttemptSweep(claim, ARTIFACT_SWEEP_BASE_MS).catch(
        () => undefined,
      );
      if (error instanceof CleanupClaimLostError) return changed;
      throw error;
    }
  }
  async failExhaustedLeases(max: number) {
    const owner = randomUUID();
    const r = await this.pool.query<Claim>(
      `WITH candidate AS (SELECT id FROM audit_export_jobs
      WHERE status IN ('pending','generating') AND attempt_count >= $1
      AND artifact_key IS NULL
      AND (lease_expires_at IS NULL OR lease_expires_at <= statement_timestamp())
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE audit_export_jobs j SET lease_owner=$2,
      lease_expires_at=statement_timestamp()+interval '1 minute' FROM candidate
      WHERE j.id=candidate.id RETURNING j.id,j.team_id AS "teamId",j.actor_id AS "actorId",
      j.start_event_id AS "startEventId",j.high_water_sequence::text AS "highWater",
      j.filters,j.attempt_count AS "attemptCount",j.lease_owner::text AS "leaseOwner",
      NULL::text AS "attemptId",NULL::text AS "artifactKey"`,
      [max, owner],
    );
    const claim = r.rows[0];
    if (!claim) return 0;
    return (await this.recordFailure(
      claim,
      { owner, durationMs: 60_000 },
      new Error('audit export attempt limit exceeded'),
      null,
    ))
      ? 1
      : 0;
  }
  async claim(lease: OutboxLease, max: number) {
    const attemptId = randomUUID();
    const r = await this.pool.query<Claim>(
      `WITH candidate AS (SELECT id FROM audit_export_jobs
      WHERE status IN ('pending','generating') AND attempt_count < $1
      AND artifact_attempt_id IS NULL AND artifact_key IS NULL
      AND available_at <= statement_timestamp()
      AND (lease_expires_at IS NULL OR lease_expires_at <= statement_timestamp())
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1), claimed AS (
        UPDATE audit_export_jobs j SET status='generating', attempt_count=attempt_count+1,
        lease_owner=$2, lease_expires_at=statement_timestamp()+($3*interval '1 millisecond'),
        artifact_attempt_id=$4::uuid,artifact_key='audit-exports/'||j.id::text||'/'||$4::text||'.csv'
        FROM candidate WHERE j.id=candidate.id RETURNING j.*
      ), attempt AS (
        INSERT INTO audit_export_artifact_attempts (id,job_id,artifact_key)
        SELECT artifact_attempt_id,id,artifact_key FROM claimed RETURNING id
      ) SELECT claimed.id,claimed.team_id AS "teamId",claimed.actor_id AS "actorId",
        claimed.start_event_id AS "startEventId",claimed.high_water_sequence::text AS "highWater",
        claimed.filters,claimed.attempt_count AS "attemptCount",claimed.lease_owner::text AS "leaseOwner",
        claimed.artifact_attempt_id::text AS "attemptId",claimed.artifact_key AS "artifactKey"
      FROM claimed JOIN attempt ON attempt.id=claimed.artifact_attempt_id`,
      [max, lease.owner, lease.durationMs, attemptId],
    );
    return r.rows[0] ?? null;
  }
  async remainsDeliverable(c: Claim, l: OutboxLease) {
    const r = await this.pool.query(
      `SELECT 1 FROM audit_export_jobs WHERE id=$1
      AND lease_owner=$2 AND lease_expires_at>statement_timestamp()
      AND artifact_attempt_id=$3 AND artifact_key=$4 AND status='generating'`,
      [c.id, l.owner, c.attemptId, c.artifactKey],
    );
    return r.rowCount === 1;
  }
  async suppressClaim() {
    return false;
  }
  async renewLease(c: Claim, l: OutboxLease) {
    const r = await this.pool.query(
      `UPDATE audit_export_jobs SET lease_expires_at=
      statement_timestamp()+($3*interval '1 millisecond') WHERE id=$1 AND lease_owner=$2
      AND lease_expires_at>statement_timestamp()
      AND artifact_attempt_id=$4 AND artifact_key=$5 AND status='generating' RETURNING id`,
      [c.id, l.owner, l.durationMs, c.attemptId, c.artifactKey],
    );
    return r.rowCount === 1;
  }
  async deliver(c: Claim, leaseSignal?: AbortSignal) {
    const tenant = createTenantDb(this.pool, c.teamId);
    const timeoutSignal = AbortSignal.timeout(ARTIFACT_EFFECT_TIMEOUT_MS);
    const signal = leaseSignal
      ? AbortSignal.any([leaseSignal, timeoutSignal])
      : timeoutSignal;
    let after = '0',
      count = 0,
      bytes = Buffer.byteLength(HEADER);
    const stillOwnsLease = () =>
      this.remainsDeliverable(c, {
        owner: c.leaseOwner,
        durationMs: 1,
      });
    async function* chunks() {
      signal.throwIfAborted();
      yield Buffer.from(HEADER);
      for (;;) {
        signal.throwIfAborted();
        const rows = await runNoAuditTenantTransaction(
          tenant,
          'audit.export.generate',
          (client) =>
            page(client, c.teamId, c.highWater, c.filters, after, PAGE_ROWS),
        );
        if (rows.length === 0) break;
        for (const row of rows) {
          signal.throwIfAborted();
          const chunk = Buffer.from(csvRow(row));
          count += 1;
          bytes += chunk.byteLength;
          if (count > STAGED_ROWS || bytes > STAGED_BYTES)
            throw new Error('audit export limit exceeded');
          yield chunk;
          after = row.sequence;
        }
        if (!(await stillOwnsLease())) {
          // The dispatcher heartbeat owns cancellation; this second check prevents new pages after loss.
          throw new Error('audit export lease lost');
        }
      }
    }
    if (!c.attemptId || !c.artifactKey)
      throw new Error('audit export attempt missing');
    const generated: Generated = {
      key: auditExportArtifactKey(c.id, c.attemptId),
      rowCount: 0,
      byteCount: 0,
    };
    if (generated.key !== c.artifactKey)
      throw new Error('audit export artifact key mismatch');
    const artifact = await this.store.putAuditExport(
      c.id,
      c.attemptId,
      chunks(),
      {
        signal,
        recordUploadId: async (uploadId) => {
          const recorded = await this.pool.query<{ active: boolean }>(
            `WITH saved AS (
               UPDATE audit_export_artifact_attempts SET upload_id=$4
               WHERE id=$3 AND artifact_key=$5
                 AND (upload_id IS NULL OR upload_id=$4) RETURNING id
             ) SELECT EXISTS (
               SELECT 1 FROM audit_export_jobs jobs JOIN saved
                 ON saved.id=jobs.artifact_attempt_id
               WHERE jobs.id=$1 AND jobs.lease_owner=$2
                 AND jobs.lease_expires_at>statement_timestamp()
                 AND jobs.artifact_key=$5 AND jobs.status='generating'
             ) AS active`,
            [c.id, c.leaseOwner, c.attemptId, uploadId, generated.key],
          );
          return recorded.rows[0]?.active === true;
        },
      },
    );
    signal.throwIfAborted();
    if (artifact.key !== generated.key)
      throw new Error('audit export store returned unexpected key');
    generated.rowCount = count;
    generated.byteCount = bytes;
    const handleBytes = randomBytes(32);
    try {
      const handle = handleBytes.toString('base64url');
      const sealed = createAuditExportHandleProtection(this.keys).seal(
        {
          kind: 'audit_export',
          teamId: c.teamId,
          actorId: c.actorId,
          jobId: c.id,
          column: 'handle_ciphertext',
        },
        handleBytes,
      );
      generated.sealed = {
        ciphertext: sealed.envelope,
        keyId: sealed.keyId,
        algorithm: sealed.algorithm,
        hash: createHash('sha256').update(handle).digest('hex'),
      };
    } finally {
      handleBytes.fill(0);
    }
    // Failed/aborted uploads have only durable cleanup state. The dispatcher
    // may skip finalization after lease loss, so retain memory only on success.
    this.generated.set(generatedId(c), generated);
  }
  failureDisposition(e: unknown) {
    return e instanceof Error && e.message.includes('limit exceeded')
      ? ('permanent' as const)
      : ('retryable' as const);
  }
  completionFailureDisposition() {
    // Each private attempt object and its publication are fenced and replayable,
    // so a database completion failure may retry.
    return 'retryable' as const;
  }
  async recordFailure(
    c: Claim,
    l: OutboxLease,
    error: unknown,
    retry: number | null,
  ) {
    const message =
      error instanceof Error ? error.message.slice(0, 1000) : 'export failed';
    if (retry === null) {
      const tenant = createTenantDb(this.pool, c.teamId);
      try {
        await runAuditedSystemMutation(
          {
            tenantDb: tenant,
            actorLabel: 'Audit export',
            requestId: randomUUID(),
          },
          async (_client, ctx) => ({
            result: undefined,
            events: [
              {
                ...ctx,
                eventVersion: 1,
                eventType: 'audit.export.failed',
                category: 'audit',
                outcome: 'succeeded',
                subjectType: 'audit_export',
                subjectId: c.id,
                subjectLabel: null,
                resourceType: null,
                resourceId: null,
                resourceLabel: null,
                details: {
                  startEventId: c.startEventId,
                  requestedByActorId: c.actorId,
                  failureCode: message.includes('limit exceeded')
                    ? 'limit_exceeded'
                    : 'artifact_generation_failed',
                },
              },
            ],
            afterEventsStored: async (client, events) => {
              const r = await client.query(
                `UPDATE audit_export_jobs SET status='failed',
              failed_at=statement_timestamp(),failure_event_id=$3,last_error=$4,
              artifact_attempt_id=NULL,artifact_key=NULL,lease_owner=NULL,lease_expires_at=NULL
              WHERE id=$1 AND lease_owner=$2
              AND ($5::uuid IS NULL OR artifact_attempt_id=$5)`,
                [c.id, l.owner, events[0]?.id, message, c.attemptId],
              );
              if (r.rowCount !== 1) throw new Error('audit export lease lost');
            },
          }),
        );
        this.forgetGenerated(c);
        return true;
      } catch (cleanupError) {
        this.forgetGenerated(c);
        throw cleanupError;
      }
    }
    const r = await this.pool.query(
      `UPDATE audit_export_jobs SET status=CASE WHEN $4::bigint IS NULL THEN 'failed' ELSE 'pending' END,
      failed_at=CASE WHEN $4::bigint IS NULL THEN statement_timestamp() ELSE NULL END,
      available_at=CASE WHEN $4::bigint IS NULL THEN available_at ELSE statement_timestamp()+($4*interval '1 millisecond') END,
      last_error=$3,artifact_attempt_id=NULL,artifact_key=NULL,lease_owner=NULL,lease_expires_at=NULL
      WHERE id=$1 AND lease_owner=$2
        AND ($5::uuid IS NULL OR artifact_attempt_id=$5) RETURNING id`,
      [c.id, l.owner, message, retry, c.attemptId],
    );
    this.forgetGenerated(c);
    return r.rowCount === 1;
  }
  async recordComplete(c: Claim, l: OutboxLease) {
    const g = this.generatedFor(c);
    if (!g?.sealed || !c.attemptId || !c.artifactKey) return false;
    const sealed = g.sealed;
    const tenant = createTenantDb(this.pool, c.teamId);
    const completionId = randomUUID();
    await runAuditedSystemMutation(
      { tenantDb: tenant, actorLabel: 'Audit export', requestId: randomUUID() },
      async (_client, ctx) => ({
        result: undefined,
        events: [
          {
            ...ctx,
            eventVersion: 1,
            eventType: 'audit.export.completed',
            category: 'audit',
            outcome: 'succeeded',
            subjectType: 'audit_export',
            subjectId: c.id,
            subjectLabel: null,
            resourceType: null,
            resourceId: null,
            resourceLabel: null,
            details: {
              startEventId: c.startEventId,
              requestedByActorId: c.actorId,
              rowCount: g.rowCount,
              byteCount: g.byteCount,
            },
          },
        ],
        afterEventsStored: async (client, events) => {
          const r = await client.query(
            `UPDATE audit_export_jobs SET
          status='ready',artifact_row_count=$4,artifact_byte_count=$5,
          handle_hash=$6,handle_ciphertext=$7,handle_key_id=$8,handle_algorithm=$9,
          handle_expires_at=statement_timestamp()+($10*interval '1 millisecond'),
          completion_event_id=$11,ready_at=statement_timestamp(),lease_owner=NULL,lease_expires_at=NULL
          WHERE id=$1 AND lease_owner=$2 AND lease_expires_at>statement_timestamp()
          AND artifact_attempt_id=$12 AND artifact_key=$3 AND status='generating'`,
            [
              c.id,
              l.owner,
              g.key,
              g.rowCount,
              g.byteCount,
              sealed.hash,
              sealed.ciphertext,
              sealed.keyId,
              sealed.algorithm,
              HANDLE_TTL_MS,
              events[0]?.id ?? completionId,
              c.attemptId,
            ],
          );
          if (r.rowCount !== 1) throw new Error('audit export lease lost');
        },
      }),
    );
    this.generated.delete(generatedId(c));
    return true;
  }
  async recordUncertain(c: Claim, l: OutboxLease, e: unknown) {
    return this.recordFailure(c, l, e, 5_000);
  }
}

export function createAuditExportDispatcher(options: {
  pool: pg.Pool;
  store: AuditExportArtifactStore;
  keys: EncryptionKeys;
  observer?: OutboxObserver;
  leaseMs?: number;
  cleanupConsumedAfterMs?: number;
}) {
  return new OutboxDispatcher({
    pool: options.pool,
    adapter: new AuditExportAdapter(
      options.pool,
      options.store,
      options.keys,
      options.cleanupConsumedAfterMs ?? 60 * 60_000,
    ),
    observer: options.observer,
    leaseMs: options.leaseMs,
  });
}
export function startAuditExportWorker(options: {
  pool: pg.Pool;
  store: AuditExportArtifactStore;
  keys: EncryptionKeys;
  observer?: OutboxObserver;
  reportError?: (e: unknown) => void;
}): OutboxWorker {
  const dispatcher = createAuditExportDispatcher(options);
  return startOutboxWorker({
    queue: 'audit_export_jobs',
    runOnce: () => dispatcher.runOnce(),
    observer: options.observer,
    onError: options.reportError,
  });
}
