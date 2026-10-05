import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { contract } from '@codaco/studio-rpc';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import type { AuditEventInput } from '../events.ts';
import {
  AUDIT_SEQUENCE_LOCK_SEED,
  AUDIT_TEAM_LOCK_KEY_SQL,
  AuditStore,
} from '../store.ts';

const db = await reachableDb();
const store = new AuditStore();

// The schema audit.list actually validates its input with, reached through the
// same standard-schema interface oRPC validates through, rather than a second
// copy of the bound: what the wire rejects is the whole point of the assertion
// below.
const [auditListInputSchema] = contract.audit.list['~orpc'].inputSchemas ?? [];

function auditListInputIssues(input: unknown) {
  if (!auditListInputSchema) {
    throw new Error('audit.list declares no input schema');
  }
  const result = auditListInputSchema['~standard'].validate(input);
  if (result instanceof Promise) {
    throw new Error('audit.list input validation is asynchronous');
  }
  return result.issues ?? [];
}

function invitationEvent(teamId: string): AuditEventInput {
  return {
    teamId,
    teamLabel: teamId,
    eventType: 'team.invitation.created',
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
    actorKind: 'user',
    actorId: 'actor',
    actorLabel: 'Audit actor',
    subjectType: 'team_invitation',
    subjectId: randomUUID(),
    subjectLabel: 'invitee@example.com',
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    requestId: randomUUID(),
    details: { role: 'member' },
  };
}

async function append(tenantDb: TenantDb, teamId: string) {
  return tenantDb.transaction((client) =>
    store.append(client, invitationEvent(teamId)),
  );
}

async function appendAsOwner(pool: pg.Pool, teamId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await store.append(client, invitationEvent(teamId));
    await client.query('COMMIT');
    return event;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * A row placed exactly where a test needs it, which `append` cannot do:
 * `occurred_at` defaults to the insert's own clock, and `event_type` is
 * confined to what this build registers. `at` plus `offset` names an instant
 * to the microsecond — an interval literal rather than a float, so the value
 * stored is the one written. Takes the owner pool: the point is to write what
 * no producer in this build can.
 */
function insertRawEvent(
  pool: pg.Pool,
  teamId: string,
  sequence: number,
  row: { eventType?: string; at?: Date; offset?: string },
) {
  return pool.query(
    `INSERT INTO audit_events (
       id, team_id, team_label, sequence, occurred_at, event_type,
       event_version, category, outcome, actor_kind, actor_id, actor_label,
       request_id, details)
     VALUES (gen_random_uuid(), $1, $1, $2,
             COALESCE($3::timestamptz, statement_timestamp()) + $4::interval,
             $5, 1, 'audit', 'succeeded', 'system', NULL, 'Studio',
             gen_random_uuid(), '{}'::jsonb)`,
    [
      teamId,
      sequence,
      row.at ?? null,
      row.offset ?? '0 microseconds',
      row.eventType ?? 'audit.system_retention',
    ],
  );
}

describe.skipIf(!db)('immutable audit store', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [
      'audit-a',
      'audit-b',
      'audit-privileges',
      'audit-concurrency',
      'audit-lock-a',
      'audit-lock-b',
      'audit-predicate-low',
      'audit-predicate-high',
      'audit-timestamp',
      'audit-facets',
      'audit-bounds',
      'audit-window',
    ]) {
      await seedTeam(pool, teamId);
    }
  });

  afterAll(async () => {
    await dispose();
  });

  it('lets runtime roles append and read but not mutate history', async () => {
    const tenant = createTenantDb(app, 'audit-privileges');
    const first = await append(tenant, 'audit-privileges');
    expect(first.sequence).toBe('1');
    expect(first.teamLabel).toBe('audit-privileges');
    const maintenanceTenant = createTenantDb(maintenance, 'audit-privileges');
    expect((await append(maintenanceTenant, 'audit-privileges')).sequence).toBe(
      '2',
    );
    expect(
      await tenant.transaction((client) =>
        store.listForTeam(client, 'audit-privileges'),
      ),
    ).toHaveLength(2);

    const privileges = await pool.query<{
      role: string;
      update: boolean;
      delete: boolean;
      truncate: boolean;
    }>(
      `SELECT role,
              has_table_privilege(role, 'audit_events', 'UPDATE') AS update,
              has_table_privilege(role, 'audit_events', 'DELETE') AS delete,
              has_table_privilege(role, 'audit_events', 'TRUNCATE') AS truncate
       FROM unnest(ARRAY['studio_app', 'studio_maintenance']) AS role
       ORDER BY role`,
    );
    expect(privileges.rows).toEqual([
      { role: 'studio_app', update: false, delete: false, truncate: false },
      {
        role: 'studio_maintenance',
        update: false,
        delete: false,
        truncate: false,
      },
    ]);

    await expect(
      tenant.query(`UPDATE audit_events SET actor_label = 'changed'`),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      tenant.query(`DELETE FROM audit_events`),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(app.query(`TRUNCATE audit_events`)).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      maintenance.query(`UPDATE audit_events SET actor_label = 'changed'`),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      maintenance.query(`DELETE FROM audit_events`),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      maintenance.query(`TRUNCATE audit_events`),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      pool.query(`UPDATE audit_events SET actor_label = 'changed'`),
    ).rejects.toThrow('audit events are immutable');
    await expect(pool.query(`DELETE FROM audit_events`)).rejects.toThrow(
      'audit events are immutable',
    );
  });

  it('enforces application-team RLS and explicit team query predicates', async () => {
    const tenantA = createTenantDb(app, 'audit-a');
    const tenantB = createTenantDb(app, 'audit-b');
    await append(tenantA, 'audit-a');
    await append(tenantB, 'audit-b');

    expect(
      await tenantA.transaction((client) =>
        store.listForTeam(client, 'audit-a'),
      ),
    ).toHaveLength(1);
    expect(await app.query(`SELECT id FROM audit_events`)).toHaveProperty(
      'rowCount',
      0,
    );
    const maintenanceClient = await maintenance.connect();
    try {
      expect(
        await store.listForTeam(maintenanceClient, 'audit-a'),
      ).toHaveLength(0);
      await expect(
        store.append(maintenanceClient, invitationEvent('audit-a')),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      maintenanceClient.release();
    }
    await expect(
      tenantA.transaction((client) =>
        store.append(client, invitationEvent('audit-b')),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const ownerClient = await pool.connect();
    try {
      expect(await store.listForTeam(ownerClient, 'audit-a')).toHaveLength(1);
      expect(await store.listForTeam(ownerClient, 'audit-b')).toHaveLength(1);
    } finally {
      ownerClient.release();
    }
  });

  it('records the insertion statement time rather than transaction start', async () => {
    const tenant = createTenantDb(app, 'audit-timestamp');
    const { transactionStarted, occurredAt } = await tenant.transaction(
      async (client) => {
        const started = await client.query<{ value: Date }>(
          `SELECT transaction_timestamp() AS value`,
        );
        await client.query(`SELECT pg_sleep(0.02)`);
        const event = await store.append(
          client,
          invitationEvent('audit-timestamp'),
        );
        return {
          transactionStarted: started.rows[0]?.value,
          occurredAt: event.occurredAt,
        };
      },
    );
    expect(transactionStarted).toBeInstanceOf(Date);
    expect(occurredAt.getTime()).toBeGreaterThan(
      transactionStarted?.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  it('keeps the unique sequence index and a separate chronological index', async () => {
    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = 'audit_events'`,
    );
    const names = indexes.rows.map(({ indexname }) => indexname);
    expect(names).toContain('audit_events_team_id_sequence_idx');
    expect(names).toContain(
      'audit_events_team_id_occurred_at_sequence_desc_idx',
    );
    expect(names).not.toContain('audit_events_team_id_sequence_desc_idx');
  });

  it('allocates a complete unique sequence under same-team concurrency', async () => {
    const tenant = createTenantDb(app, 'audit-concurrency');
    const inserted = await Promise.all(
      Array.from({ length: 12 }, () => append(tenant, 'audit-concurrency')),
    );
    expect(
      inserted
        .map(({ sequence }) => BigInt(sequence))
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual(Array.from({ length: 12 }, (_, index) => BigInt(index + 1)));
  });

  it('serializes one team lock without making another team contend', async () => {
    const holder = await app.connect();
    const contender = await app.connect();
    try {
      await holder.query('BEGIN');
      await contender.query('BEGIN');
      await holder.query(
        `SELECT pg_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL})`,
        ['audit-lock-a', AUDIT_SEQUENCE_LOCK_SEED.toString()],
      );

      const sameTeam = await contender.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL}) AS acquired`,
        ['audit-lock-a', AUDIT_SEQUENCE_LOCK_SEED.toString()],
      );
      expect(sameTeam.rows).toEqual([{ acquired: false }]);

      const otherTeam = await contender.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL}) AS acquired`,
        ['audit-lock-b', AUDIT_SEQUENCE_LOCK_SEED.toString()],
      );
      expect(otherTeam.rows).toEqual([{ acquired: true }]);
    } finally {
      await contender.query('ROLLBACK').catch(() => undefined);
      await holder.query('ROLLBACK').catch(() => undefined);
      contender.release();
      holder.release();
    }
  });

  it('allocates from the explicit team even when another team is further ahead', async () => {
    for (let index = 0; index < 5; index += 1) {
      await appendAsOwner(pool, 'audit-predicate-high');
    }
    expect((await appendAsOwner(pool, 'audit-predicate-low')).sequence).toBe(
      '1',
    );
    expect((await appendAsOwner(pool, 'audit-predicate-low')).sequence).toBe(
      '2',
    );
  });

  it('reports every distinct action and actor, and flags a hit cap', async () => {
    const tenant = createTenantDb(app, 'audit-facets');
    await append(tenant, 'audit-facets');
    // The one actor shape no producer in this build can append: the CHECK
    // constraint permits a system actor with no id, and the facet scan has to
    // reach it even though the ascending walk over actor_id never can.
    await pool.query(
      `INSERT INTO audit_events (
         id, team_id, team_label, sequence, event_type, event_version,
         category, outcome, actor_kind, actor_id, actor_label, request_id,
         details)
       VALUES (gen_random_uuid(), $1, $1, 2, 'audit.system_retention', 1,
               'audit', 'succeeded', 'system', NULL, 'Studio',
               gen_random_uuid(), '{}'::jsonb)`,
      ['audit-facets'],
    );

    const facets = await tenant.transaction((client) =>
      store.facetsForTeam(client, 'audit-facets', 10),
    );
    expect(facets.eventTypes.toSorted()).toEqual([
      'audit.system_retention',
      'team.invitation.created',
    ]);
    expect(facets.actors).toContainEqual({
      kind: 'system',
      id: null,
      label: 'Studio',
    });
    expect(facets.actors).toContainEqual({
      kind: 'user',
      id: 'actor',
      label: 'Audit actor',
    });
    expect(facets.truncated).toBe(false);

    // Below the real cardinality the list is cut and says so, rather than
    // silently pretending the team has only one action.
    const capped = await tenant.transaction((client) =>
      store.facetsForTeam(client, 'audit-facets', 1),
    );
    expect(capped.eventTypes).toHaveLength(1);
    expect(capped.actors).toHaveLength(1);
    expect(capped.truncated).toBe(true);
  });

  it('filters the list by the actor pair, including an actor with no id', async () => {
    const tenant = createTenantDb(app, 'audit-facets');
    const systemOnly = await tenant.transaction((client) =>
      store.listForTeam(client, 'audit-facets', {
        actor: { kind: 'system', id: null },
      }),
    );
    expect(systemOnly.map((row) => row.sequence)).toEqual(['2']);

    const userOnly = await tenant.transaction((client) =>
      store.listForTeam(client, 'audit-facets', {
        actor: { kind: 'user', id: 'actor' },
      }),
    );
    expect(userOnly.map((row) => row.sequence)).toEqual(['1']);
  });

  // The action menu is built from the team's whole history, which can hold
  // event types this build never registered, so the filter input has to accept
  // every event_type the table can store. The CHECK constraint is the only
  // authority on that length; a narrower input schema would show an event in
  // the feed, offer it in the menu, and then refuse the selection as a bad
  // request.
  it('accepts a filter on the longest event type the table can store', async () => {
    const longest = `audit.${'e'.repeat(122)}`;
    expect(longest).toHaveLength(128);
    await insertRawEvent(pool, 'audit-bounds', 1, { eventType: longest });
    // One character further is refused by the table, so 128 really is the
    // ceiling this bound has to reach and no further.
    await expect(
      insertRawEvent(pool, 'audit-bounds', 2, { eventType: `${longest}e` }),
    ).rejects.toThrow(/audit_events_identifier_lengths_check/);

    expect(
      auditListInputIssues({
        teamId: 'audit-bounds',
        eventTypes: [longest],
        // The same table caps actor_id at 255 characters.
        actor: { kind: 'user', id: 'a'.repeat(255) },
      }),
    ).toEqual([]);

    const tenant = createTenantDb(app, 'audit-bounds');
    const offered = await tenant.transaction((client) =>
      store.facetsForTeam(client, 'audit-bounds', 10),
    );
    expect(offered.eventTypes).toContain(longest);
    const filtered = await tenant.transaction((client) =>
      store.listForTeam(client, 'audit-bounds', { eventTypes: [longest] }),
    );
    expect(filtered.map((row) => row.eventType)).toEqual([longest]);
  });

  // `occurred_at` is `statement_timestamp()`, which Postgres keeps to the
  // microsecond, so no millisecond-precision cutoff can name the last instant
  // of a day. The window is half-open instead: the caller passes the instant
  // the next period begins, and everything before it belongs to the period
  // that instant closes.
  it('closes the occurred_at window on the instant the next period begins', async () => {
    // The bounds the activity screen sends for "to: 5 March 2026" — the
    // viewer's local midnights. Both these and the stored values are absolute
    // instants, so whatever timezone the server keeps never enters the
    // comparison: the day filtered on is the viewer's own.
    const dayStart = new Date('2026-03-05T00:00:00');
    const nextDayStart = new Date('2026-03-06T00:00:00');

    await insertRawEvent(pool, 'audit-window', 1, { at: dayStart });
    await insertRawEvent(pool, 'audit-window', 2, {
      at: nextDayStart,
      offset: '-500 microseconds',
    });
    await insertRawEvent(pool, 'audit-window', 3, { at: nextDayStart });

    const tenant = createTenantDb(app, 'audit-window');
    const withinDay = await tenant.transaction((client) =>
      store.listForTeam(client, 'audit-window', {
        occurredFrom: dayStart,
        occurredTo: nextDayStart,
      }),
    );
    // Sequence 2 sits 500 microseconds before midnight, inside the day and
    // past anything a millisecond bound could express. Sequence 3 is midnight
    // itself, which opens the next day rather than closing this one.
    expect(withinDay.map((row) => row.sequence)).toEqual(['2', '1']);

    // The cutoff this replaced, kept as the reason it had to: an inclusive
    // end-of-day rounded to the millisecond drops sequence 2, so the day the
    // viewer asked for silently loses its last event.
    const millisecondCutoff = await tenant.transaction((client) =>
      store.listForTeam(client, 'audit-window', {
        occurredFrom: dayStart,
        occurredTo: new Date('2026-03-05T23:59:59.999'),
      }),
    );
    expect(millisecondCutoff.map((row) => row.sequence)).toEqual(['1']);
  });

  it('has no foreign key that could cascade mutable rows into history', async () => {
    const foreignKeys = await pool.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'audit_events'::regclass AND contype = 'f'`,
    );
    expect(foreignKeys.rowCount).toBe(0);
  });
});
