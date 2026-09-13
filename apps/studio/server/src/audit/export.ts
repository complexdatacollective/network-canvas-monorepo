import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { AuditActorFilter } from '@codaco/studio-rpc';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { AuditExportArtifactStore } from '../assets.ts';
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
import { runNoAuditTenantTransaction } from './transaction.ts';

const DIRECT_ROWS = 1_000;
const DIRECT_BYTES = 1024 * 1024;
const STAGED_ROWS = 100_000;
const STAGED_BYTES = 100 * 1024 * 1024;
const PAGE_ROWS = 250;
const HANDLE_TTL_MS = 15 * 60_000;
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
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
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
): AuditEventInput {
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
    details: {
      deliveryMode: mode,
      highWaterSequence: highWater,
      rowLimit: mode === 'direct' ? DIRECT_ROWS : STAGED_ROWS,
      byteLimit: mode === 'direct' ? DIRECT_BYTES : STAGED_BYTES,
    },
  };
}

export async function requestAuditExport(
  context: AuditedCommandContext,
  filters: AuditExportFilters,
) {
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
  return runAuditedCommand(context, async (client, locked) => {
    const actor = await teamStore.lockActor(
      client,
      context.tenantDb.teamId,
      context.principal.userId,
    );
    if (!actor || !roleGrantsTeamAdministration(actor.role))
      throw new Error('audit export forbidden');
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
      events: [startedEvent(locked, jobId, mode, highWater)],
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
  });
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
      if (!actor || !roleGrantsTeamAdministration(actor.role))
        throw new Error('audit export forbidden');
      const row = await client.query<{
        status: 'pending' | 'generating' | 'ready' | 'failed';
        actor_id: string;
        handle_ciphertext: Buffer | null;
        handle_key_id: string | null;
        handle_algorithm: string | null;
        handle_expires_at: Date | null;
        artifact_key: string | null;
      }>(
        `SELECT status,actor_id,handle_ciphertext,handle_key_id,handle_algorithm,
       handle_expires_at,artifact_key FROM audit_export_jobs WHERE id=$1 AND team_id=$2`,
        [jobId, context.tenantDb.teamId],
      );
      const job = row.rows[0];
      if (!job || job.actor_id !== context.principal.userId)
        throw new Error('audit export not found');
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
    !job.handle_ciphertext ||
    !job.handle_key_id ||
    !job.handle_algorithm ||
    !job.handle_expires_at
  )
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
    };
  } finally {
    plaintext.fill(0);
  }
}

async function streamToString(stream: ReadableStream) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > STAGED_BYTES)
      throw new Error('stored audit export exceeds limit');
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

export async function downloadAuditExport(
  context: AuditedCommandContext,
  jobId: string,
  handle: string,
  store: AuditExportArtifactStore,
) {
  const job = await authorizedExportRow(context, jobId);
  if (
    job.status !== 'ready' ||
    !job.artifact_key ||
    !job.handle_expires_at ||
    job.handle_expires_at <= new Date()
  )
    throw new Error('audit export unavailable');
  const body = await store.getAuditExport(job.artifact_key);
  if (!body) throw new Error('audit export unavailable');
  const hash = createHash('sha256').update(handle).digest('hex');
  const consumed = await runNoAuditTenantTransaction(
    context.tenantDb,
    'audit.export.consume',
    (client) =>
      client.query(
        `UPDATE audit_export_jobs SET handle_consumed_at=statement_timestamp()
     WHERE id=$1 AND team_id=$2 AND actor_id=$3 AND status='ready'
       AND handle_hash=$4 AND handle_consumed_at IS NULL
       AND handle_expires_at>statement_timestamp() RETURNING id`,
        [jobId, context.tenantDb.teamId, context.principal.userId, hash],
      ),
  );
  if (consumed.rowCount !== 1) throw new Error('audit export unavailable');
  return { csv: await streamToString(body) };
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
};
type Generated = {
  key: string;
  rowCount: number;
  byteCount: number;
  handle: string;
  ciphertext: Buffer;
  keyId: string;
  algorithm: string;
  hash: string;
};

class AuditExportAdapter implements OutboxAdapter<Claim> {
  readonly queue = 'audit_export_jobs' as const;
  private generated = new Map<string, Generated>();
  private pool: pg.Pool;
  private store: AuditExportArtifactStore;
  private keys: EncryptionKeys;
  constructor(
    pool: pg.Pool,
    store: AuditExportArtifactStore,
    keys: EncryptionKeys,
  ) {
    this.pool = pool;
    this.store = store;
    this.keys = keys;
  }
  async suppressUndeliverable() {
    return 0;
  }
  async failExhaustedLeases(max: number) {
    const owner = randomUUID();
    const r = await this.pool.query<Claim>(
      `WITH candidate AS (SELECT id FROM audit_export_jobs
      WHERE status IN ('pending','generating') AND attempt_count >= $1
      AND (lease_expires_at IS NULL OR lease_expires_at <= statement_timestamp())
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE audit_export_jobs j SET lease_owner=$2,
      lease_expires_at=statement_timestamp()+interval '1 minute' FROM candidate
      WHERE j.id=candidate.id RETURNING j.id,j.team_id AS "teamId",j.actor_id AS "actorId",
      j.start_event_id AS "startEventId",j.high_water_sequence::text AS "highWater",
      j.filters,j.attempt_count AS "attemptCount",j.lease_owner::text AS "leaseOwner"`,
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
    const r = await this.pool.query<Claim>(
      `WITH candidate AS (SELECT id FROM audit_export_jobs
      WHERE status IN ('pending','generating') AND attempt_count < $1
      AND available_at <= statement_timestamp()
      AND (lease_expires_at IS NULL OR lease_expires_at <= statement_timestamp())
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE audit_export_jobs j SET status='generating', attempt_count=attempt_count+1,
      lease_owner=$2, lease_expires_at=statement_timestamp()+($3*interval '1 millisecond')
      FROM candidate WHERE j.id=candidate.id RETURNING j.id,j.team_id AS "teamId",
      j.actor_id AS "actorId",j.start_event_id AS "startEventId",
      j.high_water_sequence::text AS "highWater",j.filters,j.attempt_count AS "attemptCount",
      j.lease_owner::text AS "leaseOwner"`,
      [max, lease.owner, lease.durationMs],
    );
    return r.rows[0] ?? null;
  }
  async remainsDeliverable(c: Claim, l: OutboxLease) {
    const r = await this.pool.query(
      `SELECT 1 FROM audit_export_jobs WHERE id=$1
      AND lease_owner=$2 AND lease_expires_at>statement_timestamp()
      AND status='generating'`,
      [c.id, l.owner],
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
      AND status='generating' RETURNING id`,
      [c.id, l.owner, l.durationMs],
    );
    return r.rowCount === 1;
  }
  async deliver(c: Claim) {
    const tenant = createTenantDb(this.pool, c.teamId);
    let after = '0',
      count = 0,
      bytes = Buffer.byteLength(HEADER);
    const self = this;
    async function* chunks() {
      yield Buffer.from(HEADER);
      for (;;) {
        const rows = await runNoAuditTenantTransaction(
          tenant,
          'audit.export.generate',
          (client) =>
            page(client, c.teamId, c.highWater, c.filters, after, PAGE_ROWS),
        );
        if (rows.length === 0) break;
        for (const row of rows) {
          const chunk = Buffer.from(csvRow(row));
          count += 1;
          bytes += chunk.byteLength;
          if (count > STAGED_ROWS || bytes > STAGED_BYTES)
            throw new Error('audit export limit exceeded');
          yield chunk;
          after = row.sequence;
        }
        if (
          !(await self.remainsDeliverable(c, {
            owner: c.leaseOwner,
            durationMs: 1,
          }))
        ) {
          // The dispatcher heartbeat owns cancellation; this second check prevents new pages after loss.
          throw new Error('audit export lease lost');
        }
      }
    }
    const artifact = await this.store.putAuditExport(c.id, chunks());
    const handleBytes = randomBytes(32);
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
    handleBytes.fill(0);
    this.generated.set(c.id, {
      key: artifact.key,
      rowCount: count,
      byteCount: bytes,
      handle,
      ciphertext: sealed.envelope,
      keyId: sealed.keyId,
      algorithm: sealed.algorithm,
      hash: createHash('sha256').update(handle).digest('hex'),
    });
  }
  failureDisposition(e: unknown) {
    return e instanceof Error && e.message.includes('limit exceeded')
      ? ('permanent' as const)
      : ('retryable' as const);
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
      const generated = this.generated.get(c.id);
      if (generated)
        await this.store
          .deleteAuditExport(generated.key)
          .catch(() => undefined);
      const tenant = createTenantDb(this.pool, c.teamId);
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
            artifact_key=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1
            AND lease_owner=$2`,
              [c.id, l.owner, events[0]?.id, message],
            );
            if (r.rowCount !== 1) throw new Error('audit export lease lost');
          },
        }),
      );
      this.generated.delete(c.id);
      return true;
    }
    const r = await this.pool.query(
      `UPDATE audit_export_jobs SET status=CASE WHEN $4::bigint IS NULL THEN 'failed' ELSE 'pending' END,
      failed_at=CASE WHEN $4::bigint IS NULL THEN statement_timestamp() ELSE NULL END,
      available_at=CASE WHEN $4::bigint IS NULL THEN available_at ELSE statement_timestamp()+($4*interval '1 millisecond') END,
      last_error=$3,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_owner=$2 RETURNING id`,
      [c.id, l.owner, message, retry],
    );
    return r.rowCount === 1;
  }
  async recordComplete(c: Claim, l: OutboxLease) {
    const g = this.generated.get(c.id);
    if (!g) return false;
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
          status='ready',artifact_key=$3,artifact_row_count=$4,artifact_byte_count=$5,
          handle_hash=$6,handle_ciphertext=$7,handle_key_id=$8,handle_algorithm=$9,
          handle_expires_at=statement_timestamp()+($10*interval '1 millisecond'),
          completion_event_id=$11,ready_at=statement_timestamp(),lease_owner=NULL,lease_expires_at=NULL
          WHERE id=$1 AND lease_owner=$2 AND lease_expires_at>statement_timestamp()
          AND status='generating'`,
            [
              c.id,
              l.owner,
              g.key,
              g.rowCount,
              g.byteCount,
              g.hash,
              g.ciphertext,
              g.keyId,
              g.algorithm,
              HANDLE_TTL_MS,
              events[0]?.id ?? completionId,
            ],
          );
          if (r.rowCount !== 1) throw new Error('audit export lease lost');
        },
      }),
    );
    this.generated.delete(c.id);
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
}) {
  return new OutboxDispatcher({
    pool: options.pool,
    adapter: new AuditExportAdapter(options.pool, options.store, options.keys),
    observer: options.observer,
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
