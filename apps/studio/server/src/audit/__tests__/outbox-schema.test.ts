// The two audit outbox tables: the staged export job (#1520) and the alert
// outbox (#1521). What is proved here is the database half of "no handle or
// partial artifact is released", the single-use handle, the immutability of an
// export request and of an alert's link to its immutable event, and the
// deliberate policy divergence — both tables carry the ordinary
// `team_isolation` policy, so the workers that drive them can claim across
// teams while `audit_events` itself stays behind the strict policy.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK or foreign-key violation, the SQLSTATE for a privilege
// refusal, the message for a trigger — so a guard that stopped firing cannot
// pass as "no error".
import { randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

const hex64 = () => randomBytes(32).toString('hex');

/** Distinct per-team audit sequences, which are uniquely indexed. */
let nextSequence = 0;
const sequence = () => String(++nextSequence);

/**
 * The five columns an outbox row pins through: the link, its team, and the
 * three the row copies out of the event so the dispatcher can route without
 * reading it.
 */
type EventIdentity = {
  id: string;
  sequence: string;
  event_type: string;
  event_version: number;
};

/** The seven columns a ready job must carry, all or none. */
const READY_COLUMNS = [
  'handle_hash',
  'handle_expires_at',
  'artifact_key',
  'artifact_row_count',
  'artifact_byte_count',
  'completion_event_id',
  'ready_at',
] as const;

describe.skipIf(!db)('audit outbox schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers or constraints.
  // Role-sensitive probes use the `app` and `maintenance` pools instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const eventRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    team_label: 'Team A',
    sequence: sequence(),
    event_type: 'audit.export.started',
    event_version: 1,
    category: 'data_egress',
    outcome: 'succeeded',
    actor_kind: 'user',
    actor_id: 'user-1',
    actor_label: 'Researcher',
    request_id: randomUUID(),
    details: JSON.stringify({}),
    ...overrides,
  });

  const readyPayload = (): Row => ({
    status: 'ready',
    handle_hash: hex64(),
    handle_expires_at: new Date(),
    artifact_key: `exports/${randomUUID()}.csv`,
    artifact_row_count: 10,
    artifact_byte_count: 2048,
    completion_event_id: randomUUID(),
    ready_at: new Date(),
  });

  const jobRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    actor_kind: 'user',
    actor_id: 'user-1',
    start_event_id: randomUUID(),
    start_event_sequence: '1',
    high_water_sequence: '10',
    filters: JSON.stringify({ category: 'data_egress' }),
    row_limit: 1000,
    byte_limit: 1_000_000,
    preflight_row_count: 10,
    preflight_byte_count: 2048,
    ...overrides,
  });

  // The copied columns default to the event's own, because the composite key
  // binds them to it: an alert that cites one event and describes another is
  // a foreign-key violation, not an accepted row.
  const outboxRow = (event: EventIdentity, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    audit_event_id: event.id,
    audit_event_sequence: event.sequence,
    event_type: event.event_type,
    event_version: event.event_version,
    alert_policy_key: 'bulk_export',
    ...overrides,
  });

  async function newEvent(overrides: Row = {}): Promise<EventIdentity> {
    const row = eventRow(overrides);
    await insert('audit_events', row);
    return {
      id: row.id as string,
      sequence: row.sequence as string,
      event_type: row.event_type as string,
      event_version: row.event_version as number,
    };
  }

  async function newJob(overrides: Row = {}): Promise<string> {
    const row = jobRow(overrides);
    await insert('audit_export_jobs', row);
    return row.id as string;
  }

  async function newOutboxRow(overrides: Row = {}): Promise<string> {
    const event = await newEvent({
      team_id: (overrides.team_id as string | undefined) ?? TEAM_A,
    });
    const row = outboxRow(event, overrides);
    await insert('audit_alert_outbox', row);
    return row.id as string;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) await seedTeam(pool, teamId);
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('audit_export_jobs', () => {
    it('applies the documented defaults', async () => {
      const id = await newJob();

      const row = await pool.query<Row>(
        `SELECT status, attempt_count, lease_owner, lease_expires_at,
                artifact_key, handle_hash, handle_consumed_at,
                completion_event_id, failure_event_id, ready_at, failed_at,
                available_at IS NOT NULL AS scheduled,
                created_at IS NOT NULL AS stamped
         FROM audit_export_jobs WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]).toEqual({
        status: 'pending',
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        artifact_key: null,
        handle_hash: null,
        handle_consumed_at: null,
        completion_event_id: null,
        failure_event_id: null,
        ready_at: null,
        failed_at: null,
        scheduled: true,
        stamped: true,
      });
    });

    it.each(READY_COLUMNS)(
      'refuses a ready job that is missing %s',
      async (column) => {
        const partial = readyPayload();
        partial[column] = null;

        await expect(
          insert('audit_export_jobs', jobRow(partial)),
        ).rejects.toMatchObject({
          constraint: 'audit_export_jobs_ready_state_check',
        });
      },
    );

    it('refuses a complete artifact on a job that is not ready', async () => {
      // The other half of the same equality: the handle and the artifact
      // coordinates may not be released before the completing commit.
      await expect(
        insert(
          'audit_export_jobs',
          jobRow({ ...readyPayload(), status: 'generating' }),
        ),
      ).rejects.toMatchObject({
        constraint: 'audit_export_jobs_ready_state_check',
      });
    });

    it('accepts a job that carries the whole ready shape', async () => {
      await expect(
        insert('audit_export_jobs', jobRow(readyPayload())),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      [
        'a failed job with no failure event',
        { status: 'failed', failed_at: new Date() },
      ],
      [
        'a failed job with no failure timestamp',
        { status: 'failed', failure_event_id: randomUUID() },
      ],
      [
        'failure evidence on a job that has not failed',
        { failed_at: new Date(), failure_event_id: randomUUID() },
      ],
      [
        'a failed job that still names an artifact',
        {
          status: 'failed',
          failed_at: new Date(),
          failure_event_id: randomUUID(),
          artifact_key: 'exports/partial.csv',
        },
      ],
    ])('refuses %s', async (_label, overrides) => {
      await expect(
        insert('audit_export_jobs', jobRow(overrides)),
      ).rejects.toMatchObject({
        constraint: 'audit_export_jobs_failed_state_check',
      });
    });

    it('accepts a failure recorded with both halves and no artifact', async () => {
      await expect(
        insert(
          'audit_export_jobs',
          jobRow({
            status: 'failed',
            failed_at: new Date(),
            failure_event_id: randomUUID(),
            last_error: 'generator crashed',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      [
        'an unknown status',
        { status: 'cancelled' },
        'audit_export_jobs_status_check',
      ],
      [
        'an unknown actor kind',
        { actor_kind: 'system' },
        'audit_export_jobs_actor_kind_check',
      ],
      [
        'a zero row budget',
        { row_limit: 0 },
        'audit_export_jobs_budgets_check',
      ],
      [
        'a zero byte budget',
        { byte_limit: 0 },
        'audit_export_jobs_budgets_check',
      ],
      [
        'a negative preflight count',
        { preflight_row_count: -1 },
        'audit_export_jobs_budgets_check',
      ],
      [
        'a negative attempt count',
        { attempt_count: -1 },
        'audit_export_jobs_budgets_check',
      ],
      [
        'a start sequence before the first event',
        { start_event_sequence: '0' },
        'audit_export_jobs_budgets_check',
      ],
      [
        'a negative high-water mark',
        { high_water_sequence: '-1' },
        'audit_export_jobs_budgets_check',
      ],
      [
        'scalar filters',
        { filters: JSON.stringify('everything') },
        'audit_export_jobs_filters_object_check',
      ],
      [
        'a malformed handle digest',
        { ...readyPayload(), handle_hash: 'not-a-digest' },
        'audit_export_jobs_handle_hash_format_check',
      ],
      [
        'a consumption stamp with no handle',
        { handle_consumed_at: new Date() },
        'audit_export_jobs_consumed_check',
      ],
      [
        'half a lease',
        { lease_owner: randomUUID() },
        'audit_export_jobs_lease_check',
      ],
      [
        'a terminal job still holding a lease',
        {
          ...readyPayload(),
          lease_owner: randomUUID(),
          lease_expires_at: new Date(),
        },
        'audit_export_jobs_terminal_state_check',
      ],
      [
        'a blank actor id',
        { actor_id: '' },
        'audit_export_jobs_identifier_lengths_check',
      ],
      [
        'an over-long last error',
        { last_error: 'e'.repeat(1001) },
        'audit_export_jobs_identifier_lengths_check',
      ],
    ])('refuses %s', async (_label, overrides, constraint) => {
      await expect(
        insert('audit_export_jobs', jobRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('admits at most one live handle across all jobs', async () => {
      const shared = readyPayload();
      await insert('audit_export_jobs', jobRow(shared));

      await expect(
        insert('audit_export_jobs', jobRow(shared)),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'audit_export_jobs_handle_hash_idx',
      });
    });
  });

  describe('audit_export_request_immutable', () => {
    it.each([
      ['the owning team', `team_id = '${TEAM_B}'`],
      ['the requesting actor', `actor_id = 'user-2'`],
      ['the actor kind', `actor_kind = 'api_token'`],
      ['the start event', `start_event_id = '${randomUUID()}'`],
      ['the start sequence', `start_event_sequence = 99`],
      ['the high-water mark', `high_water_sequence = 99`],
      ['the filters', `filters = '{"category":"study"}'::jsonb`],
      ['the row budget', 'row_limit = 1'],
      ['the byte budget', 'byte_limit = 1'],
      ['the preflight row count', 'preflight_row_count = 99'],
      ['the preflight byte count', 'preflight_byte_count = 99'],
      ['the creation stamp', 'created_at = now()'],
    ])('refuses to rewrite %s', async (_label, assignment) => {
      const id = await newJob();

      await expect(
        pool.query(`UPDATE audit_export_jobs SET ${assignment} WHERE id = $1`, [
          id,
        ]),
      ).rejects.toThrow('audit export request is immutable');
    });

    it('lets the worker advance generation state', async () => {
      const id = await newJob();

      const claimed = await pool.query(
        `UPDATE audit_export_jobs
         SET status = 'generating', attempt_count = attempt_count + 1,
             lease_owner = $2, lease_expires_at = now() + interval '1 minute'
         WHERE id = $1`,
        [id, randomUUID()],
      );
      expect(claimed.rowCount).toBe(1);

      const completed = await pool.query(
        `UPDATE audit_export_jobs
         SET status = 'ready', lease_owner = NULL, lease_expires_at = NULL,
             handle_hash = $2, handle_expires_at = now() + interval '1 hour',
             artifact_key = $3, artifact_row_count = 10,
             artifact_byte_count = 2048, completion_event_id = $4,
             ready_at = now()
         WHERE id = $1`,
        [id, hex64(), `exports/${id}.csv`, randomUUID()],
      );
      expect(completed.rowCount).toBe(1);
    });
  });

  describe('audit_export_handle_single_use', () => {
    it('admits the first consumption and refuses every later one', async () => {
      const id = await newJob(readyPayload());

      const consumed = await pool.query(
        `UPDATE audit_export_jobs SET handle_consumed_at = now() WHERE id = $1`,
        [id],
      );
      expect(consumed.rowCount).toBe(1);

      await expect(
        pool.query(
          `UPDATE audit_export_jobs SET handle_consumed_at = now() WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow('audit export handle is single use');
      await expect(
        pool.query(
          `UPDATE audit_export_jobs SET handle_consumed_at = NULL WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow('audit export handle is single use');
    });

    it('refuses to re-issue a handle on a job that already published one', async () => {
      const id = await newJob(readyPayload());

      await expect(
        pool.query(
          `UPDATE audit_export_jobs SET handle_hash = $2 WHERE id = $1`,
          [id, hex64()],
        ),
      ).rejects.toThrow('audit export handle is single use');
    });
  });

  describe('audit_alert_outbox', () => {
    it('applies the documented defaults', async () => {
      const id = await newOutboxRow();

      const row = await pool.query<Row>(
        `SELECT attempt_count, lease_owner, lease_expires_at, delivered_at,
                failed_at, suppressed_at, last_error,
                available_at IS NOT NULL AS scheduled,
                created_at IS NOT NULL AS stamped
         FROM audit_alert_outbox WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]).toEqual({
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        delivered_at: null,
        failed_at: null,
        suppressed_at: null,
        last_error: null,
        scheduled: true,
        stamped: true,
      });
    });

    it('keeps exactly one durable row per committed event', async () => {
      const event = await newEvent();
      await insert('audit_alert_outbox', outboxRow(event));

      await expect(
        insert('audit_alert_outbox', outboxRow(event)),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'audit_alert_outbox_audit_event_id_idx',
      });
    });

    it("refuses an alert citing another team's event", async () => {
      const theirEvent = await newEvent({ team_id: TEAM_B });

      // Referential integrity bypasses row-level security, so a single-column
      // foreign key here would be a cross-team existence oracle.
      await expect(
        insert(
          'audit_alert_outbox',
          outboxRow(theirEvent, { team_id: TEAM_A }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'audit_alert_outbox_audit_event_fk',
      });
      await expect(
        insert(
          'audit_alert_outbox',
          outboxRow(theirEvent, { team_id: TEAM_B }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses an alert citing no event at all', async () => {
      await expect(
        insert(
          'audit_alert_outbox',
          outboxRow({
            id: randomUUID(),
            sequence: sequence(),
            event_type: 'audit.export.started',
            event_version: 1,
          }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'audit_alert_outbox_audit_event_fk',
      });
    });

    // The alert policy decides from `event_type` and `event_version`, and the
    // dispatcher orders and rate-limits on `audit_event_sequence`. A key that
    // proved only (audit_event_id, team_id) would let a row cite a real event
    // and describe a different one, routing a real alert under a fabricated
    // description.
    it.each([
      ['another event’s sequence', { audit_event_sequence: '999999' }],
      ['another event type', { event_type: 'study.deleted' }],
      ['another event version', { event_version: 2 }],
    ])('refuses an alert copying %s', async (_label, overrides) => {
      const event = await newEvent();

      await expect(
        insert('audit_alert_outbox', outboxRow(event, overrides)),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'audit_alert_outbox_audit_event_fk',
        detail: expect.stringContaining(
          'is not present in table "audit_events"',
        ),
      });
    });

    it('accepts the copy the key exists to admit', async () => {
      const event = await newEvent({
        event_type: 'participant.erased',
        event_version: 3,
        category: 'participant_data',
      });

      await expect(
        insert('audit_alert_outbox', outboxRow(event)),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it.each([
      [
        'a sequence before the first event',
        { audit_event_sequence: '0' },
        'audit_alert_outbox_sequence_check',
      ],
      [
        'a zero event version',
        { event_version: 0 },
        'audit_alert_outbox_sequence_check',
      ],
      [
        'a negative attempt count',
        { attempt_count: -1 },
        'audit_alert_outbox_sequence_check',
      ],
      [
        'a blank event type',
        { event_type: '' },
        'audit_alert_outbox_lengths_check',
      ],
      [
        'a blank policy key',
        { alert_policy_key: '' },
        'audit_alert_outbox_lengths_check',
      ],
      [
        'an over-long last error',
        { last_error: 'e'.repeat(1001) },
        'audit_alert_outbox_lengths_check',
      ],
      [
        'half a lease',
        { lease_expires_at: new Date() },
        'audit_alert_outbox_lease_check',
      ],
      [
        'two terminal states at once',
        { delivered_at: new Date(), suppressed_at: new Date() },
        'audit_alert_outbox_terminal_state_check',
      ],
      [
        'a terminal row still holding a lease',
        {
          delivered_at: new Date(),
          lease_owner: randomUUID(),
          lease_expires_at: new Date(),
        },
        'audit_alert_outbox_terminal_state_check',
      ],
    ])('refuses %s', async (_label, overrides, constraint) => {
      const event = await newEvent();
      await expect(
        insert('audit_alert_outbox', outboxRow(event, overrides)),
      ).rejects.toMatchObject({ constraint });
    });
  });

  describe('audit_alert_link_immutable', () => {
    it.each([
      ['the owning team', `team_id = '${TEAM_B}'`],
      ['the event link', `audit_event_id = '${randomUUID()}'`],
      ['the event sequence', 'audit_event_sequence = 99'],
      ['the event type', `event_type = 'study.deleted'`],
      ['the event version', 'event_version = 2'],
      ['the policy key', `alert_policy_key = 'token_egress'`],
      ['the creation stamp', 'created_at = now()'],
    ])('refuses to rewrite %s', async (_label, assignment) => {
      const id = await newOutboxRow();

      await expect(
        pool.query(
          `UPDATE audit_alert_outbox SET ${assignment} WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow('audit alert link is immutable');
    });

    it('lets the dispatcher advance delivery state', async () => {
      const id = await newOutboxRow();

      const claimed = await maintenance.query(
        `UPDATE audit_alert_outbox
         SET attempt_count = attempt_count + 1, lease_owner = $2,
             lease_expires_at = now() + interval '1 minute',
             last_error = 'channel timeout'
         WHERE id = $1`,
        [id, randomUUID()],
      );
      expect(claimed.rowCount).toBe(1);

      const delivered = await maintenance.query(
        `UPDATE audit_alert_outbox
         SET delivered_at = now(), lease_owner = NULL, lease_expires_at = NULL
         WHERE id = $1`,
        [id],
      );
      expect(delivered.rowCount).toBe(1);
    });
  });

  describe('the event and its alert commit together', () => {
    it('leaves neither row behind when the transaction rolls back', async () => {
      const rolledBackEvent = randomUUID();
      const rolledBackAlert = randomUUID();
      const rolledBackSequence = sequence();
      const failure = new Error('command failed after enqueueing the alert');

      await expect(
        tenantA.transaction(async (client) => {
          await client.query(
            `INSERT INTO audit_events (id, team_id, team_label, sequence,
               event_type, event_version, category, outcome, actor_kind,
               actor_id, actor_label, request_id, details)
             VALUES ($1, $2, 'Team A', $3, 'audit.export.started', 1,
               'data_egress', 'succeeded', 'user', 'user-1', 'Researcher',
               $4, '{}'::jsonb)`,
            [rolledBackEvent, TEAM_A, rolledBackSequence, randomUUID()],
          );
          await client.query(
            `INSERT INTO audit_alert_outbox (id, team_id, audit_event_id,
               audit_event_sequence, event_type, event_version, alert_policy_key)
             VALUES ($1, $2, $3, $4, 'audit.export.started', 1, 'bulk_export')`,
            [rolledBackAlert, TEAM_A, rolledBackEvent, rolledBackSequence],
          );
          throw failure;
        }),
      ).rejects.toBe(failure);

      const survivors = await pool.query<{ events: number; alerts: number }>(
        `SELECT (SELECT count(*)::int FROM audit_events WHERE id = $1) AS events,
                (SELECT count(*)::int FROM audit_alert_outbox WHERE id = $2) AS alerts`,
        [rolledBackEvent, rolledBackAlert],
      );
      expect(survivors.rows[0]).toEqual({ events: 0, alerts: 0 });
    });

    it('keeps both rows when it commits', async () => {
      const eventId = randomUUID();
      const alertId = randomUUID();
      const eventSequence = sequence();

      await tenantA.transaction(async (client) => {
        await client.query(
          `INSERT INTO audit_events (id, team_id, team_label, sequence,
             event_type, event_version, category, outcome, actor_kind,
             actor_id, actor_label, request_id, details)
           VALUES ($1, $2, 'Team A', $3, 'audit.export.started', 1,
             'data_egress', 'succeeded', 'user', 'user-1', 'Researcher',
             $4, '{}'::jsonb)`,
          [eventId, TEAM_A, eventSequence, randomUUID()],
        );
        await client.query(
          `INSERT INTO audit_alert_outbox (id, team_id, audit_event_id,
             audit_event_sequence, event_type, event_version, alert_policy_key)
           VALUES ($1, $2, $3, $4, 'audit.export.started', 1, 'bulk_export')`,
          [alertId, TEAM_A, eventId, eventSequence],
        );
      });

      const survivors = await pool.query<{ events: number; alerts: number }>(
        `SELECT (SELECT count(*)::int FROM audit_events WHERE id = $1) AS events,
                (SELECT count(*)::int FROM audit_alert_outbox WHERE id = $2) AS alerts`,
        [eventId, alertId],
      );
      expect(survivors.rows[0]).toEqual({ events: 1, alerts: 1 });
    });
  });

  describe('the deliberate policy divergence', () => {
    it('lets maintenance claim alerts across teams but never enumerate history', async () => {
      const mine = await newOutboxRow();
      const theirs = await newOutboxRow({ team_id: TEAM_B });
      const events = await pool.query<{ id: string }>(
        `SELECT e.id FROM audit_events e
         JOIN audit_alert_outbox o ON o.audit_event_id = e.id
         WHERE o.id = ANY($1::uuid[])`,
        [[mine, theirs]],
      );
      const eventIds = events.rows.map((row) => row.id);
      expect(eventIds).toHaveLength(2);

      // The dispatcher's claim scan runs with no team context at all.
      const claimable = await maintenance.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_alert_outbox
         WHERE id = ANY($1::uuid[])`,
        [[mine, theirs]],
      );
      expect(claimable.rows[0]).toEqual({ n: 2 });

      // The history those alerts point at stays behind the strict policy: the
      // escape buys the claim scan, not the events.
      const history = await maintenance.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE id = ANY($1::uuid[])`,
        [eventIds],
      );
      expect(history.rows[0]).toEqual({ n: 0 });

      // The connecting login is the oracle that the rows really are there.
      const actual = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE id = ANY($1::uuid[])`,
        [eventIds],
      );
      expect(actual.rows[0]).toEqual({ n: 2 });
    });

    it('still scopes the outbox to one team for the application role', async () => {
      const mine = await newOutboxRow();
      const theirs = await newOutboxRow({ team_id: TEAM_B });

      const visible = await tenantA.query(
        `SELECT id FROM audit_alert_outbox WHERE id = ANY($1::uuid[])`,
        [[mine, theirs]],
      );
      expect(visible.rows).toEqual([{ id: mine }]);
    });
  });

  describe('the application role privileges', () => {
    it('may consume a download handle and change nothing else', async () => {
      const id = await newJob(readyPayload());

      const consumed = await tenantA.query(
        `UPDATE audit_export_jobs SET handle_consumed_at = now() WHERE id = $1`,
        [id],
      );
      expect(consumed.rowCount).toBe(1);

      await expect(
        tenantA.query(
          `UPDATE audit_export_jobs SET last_error = 'x' WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        tenantA.query(
          `UPDATE audit_export_jobs SET status = 'failed' WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        tenantA.query(`DELETE FROM audit_export_jobs WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('may enqueue an alert but never advance or retract one', async () => {
      const event = await newEvent();
      const alertId = randomUUID();

      const enqueued = await tenantA.query(
        `INSERT INTO audit_alert_outbox (id, team_id, audit_event_id,
           audit_event_sequence, event_type, event_version, alert_policy_key)
         VALUES ($1, $2, $3, $4, 'audit.export.started', 1, 'bulk_export')`,
        [alertId, TEAM_A, event.id, event.sequence],
      );
      expect(enqueued.rowCount).toBe(1);

      await expect(
        tenantA.query(
          `UPDATE audit_alert_outbox SET delivered_at = now() WHERE id = $1`,
          [alertId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        tenantA.query(`DELETE FROM audit_alert_outbox WHERE id = $1`, [
          alertId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
});
