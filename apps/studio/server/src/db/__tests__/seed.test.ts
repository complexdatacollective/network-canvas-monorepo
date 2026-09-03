import { verifyPassword } from 'better-auth/crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEAM_ROLES } from '@codaco/studio-rpc';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_NAME,
  SEED_ADMIN_PASSWORD,
  seed,
} from '../seed.ts';

const db = await reachableDb();

// Seeding the whole model takes seconds on a quiet machine and well over a
// minute on the CI runner (see SEED_BUDGET_MS), and several cases below seed
// twice.
const SEEDING_TIMEOUT_MS = 180_000;

/**
 * A `demo` seed has to stay fast enough to run on every `pnpm dev` boot, where
 * it takes around five seconds against a quiet database. The bound is loose
 * against that because this case measures a seed running beside the rest of the
 * suite on one Postgres: it exists to catch a phase that becomes minutes — a
 * full-cohort schedule resolution, or a network config an order of magnitude
 * wider — not one that becomes a second slower.
 *
 * It is not asserted on the CI runner at all. Wall time measures the seed only
 * where the seed is what the machine is doing; there, two vCPUs are shared by
 * every affected package's vitest workers and the Postgres service container,
 * and this same five-second seed measured 117 seconds — a number that says
 * nothing about a dev boot. `MAX_DEMO_ROWS` is the budget that holds
 * everywhere, because nothing a neighbour does can change it.
 */
const SEED_BUDGET_MS = 60_000;

/**
 * The whole demo corpus, every table counted. The network is most of it
 * (around 18 000 nodes and 11 000 edges at the current window); the bound sits
 * far enough above the total to admit another study or a longer prompt run,
 * and far enough below ten times it to catch the width regression the time
 * budget was written for.
 */
const MAX_DEMO_ROWS = 80_000;

/**
 * Columns no seed run controls, excluded from the reproducibility dump.
 *
 * Every one of them is written by code the seed calls rather than by the seed
 * itself, and each is named here rather than the whole table being skipped:
 *
 *  - `account.password` — better-auth's scrypt draws a fresh salt per call.
 *  - `audit_events.id` / `occurred_at` — `AuditStore.append` mints the id with
 *    `randomUUID()` and Postgres fills `occurred_at` from
 *    `statement_timestamp()`. Using the real audit writer is the point; these
 *    two columns are the price.
 *  - `session_stats.computed_at` — `refreshSessionProjections` writes
 *    `statement_timestamp()`, and the seed must not hand-write the rollups.
 *  - the protocol store's draft and section `created_at` columns, which take
 *    their database defaults. (The protocol's own dates and each version's
 *    `published_at` are seed-controlled, so the line predates the studies
 *    that pin it, and are compared.)
 */
const NON_REPRODUCIBLE_COLUMNS: Record<string, readonly string[]> = {
  account: ['password'],
  audit_events: ['id', 'occurred_at'],
  session_stats: ['computed_at'],
  protocol_drafts: ['created_at'],
  sections: ['created_at'],
};

/**
 * Every table's rows as one canonical string, ordered by content so row order
 * — which nothing in the data model fixes — cannot make two equal datasets
 * compare unequal.
 */
async function dumpEverything(pool: pg.Pool): Promise<Map<string, string>> {
  const tables = await pool.query<{ name: string }>(
    `select tablename as name from pg_tables
     where schemaname = current_schema() and tablename <> 'schemaFingerprint'
     order by tablename`,
  );
  const dump = new Map<string, string>();
  for (const { name } of tables.rows) {
    const columns = await pool.query<{ name: string }>(
      `select column_name as name from information_schema.columns
       where table_schema = current_schema() and table_name = $1
       order by ordinal_position`,
      [name],
    );
    const excluded = new Set(NON_REPRODUCIBLE_COLUMNS[name] ?? []);
    const selected = columns.rows
      .map((column) => column.name)
      .filter((column) => !excluded.has(column))
      .map((column) => `"${column}"`);
    const rows = await pool.query<{ dump: string }>(
      `select coalesce(
                jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),
                '[]'::jsonb
              )::text as dump
       from (select ${selected.join(', ')} from "${name}") t`,
    );
    dump.set(name, rows.rows[0]?.dump ?? '[]');
  }
  return dump;
}

async function count(
  pool: pg.Pool,
  sql: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await pool.query<{ n: number }>(sql, values);
  return result.rows[0]?.n ?? -1;
}

// The populated corpus, seeded once into a shared scratch schema. It is
// declared first so that its timing case measures a seed into a database
// this file has not already churned eight schemas through.
describe.skipIf(!db)('the seeded dataset', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>> | undefined;
  let pool: pg.Pool;
  let elapsedMs = 0;
  let adminId = '';

  beforeAll(async () => {
    if (!db) return;
    scratch = await createScratchSchema(db);
    pool = scratch.pool;
    await provisionScratchSchema(pool);
    const started = performance.now();
    await seed(pool);
    elapsedMs = performance.now() - started;
    const admin = await pool.query<{ id: string }>(
      `select id from "user" where email = $1`,
      [SEED_ADMIN_EMAIL],
    );
    adminId = admin.rows[0]!.id;
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    await scratch?.dispose();
  });

  it.skipIf(process.env.CI)(
    'finishes inside the dev-boot budget at demo scale',
    () => {
      expect(elapsedMs).toBeLessThan(SEED_BUDGET_MS);
    },
  );

  it('stays the size that seeds in seconds', async () => {
    const tables = await pool.query<{ name: string }>(
      `select tablename as name from pg_tables
       where schemaname = current_schema() and tablename <> 'schemaFingerprint'`,
    );
    let total = 0;
    for (const { name } of tables.rows) {
      total += await count(pool, `select count(*)::int as n from "${name}"`);
    }
    expect(total).toBeGreaterThan(10_000);
    expect(total).toBeLessThan(MAX_DEMO_ROWS);
  });

  it('covers every study state and both participation modes', async () => {
    const states = await pool.query<{ state: string }>(
      `select distinct state from studies order by state`,
    );
    expect(states.rows.map((row) => row.state)).toEqual([
      'closed',
      'draft',
      'live',
      'paused',
    ]);
    const modes = await pool.query<{ mode: string }>(
      `select distinct participation_mode as mode from studies order by 1`,
    );
    expect(modes.rows.map((row) => row.mode)).toEqual(['anonymous', 'managed']);

    // The deletion marker and its consistency check both need a live example.
    await expect(
      count(
        pool,
        `select count(*)::int as n from studies
         where deletion_requested_at is not null and purge_after is not null`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('numbers every study’s waves densely from one', async () => {
    // Dense from one is exactly: the lowest number is 1, the highest equals
    // the count, and no number repeats.
    const gaps = await pool.query<{ id: string }>(
      `select s.id from studies s
       join study_waves w on w.study_id = s.id
       group by s.id
       having min(w.wave_number) <> 1
           or max(w.wave_number) <> count(*)
           or count(distinct w.wave_number) <> count(*)`,
    );
    expect(gaps.rows).toEqual([]);
    await expect(
      count(pool, `select count(*)::int as n from study_waves`),
    ).resolves.toBeGreaterThan(0);
  });

  it('pins every collecting wave to a version of its own study’s protocol line', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n
         from study_waves w
         join studies s on s.id = w.study_id
         where s.state in ('live', 'paused', 'closed')
           and (w.protocol_version_id is null
                or not exists (
                  select 1 from protocol_versions v
                  where v.id = w.protocol_version_id
                    and v.protocol_id = s.protocol_id
                    and v.team_id = s.team_id))`,
      ),
    ).resolves.toBe(0);
    // A draft study may carry a protocol line, but its waves pin nothing.
    await expect(
      count(
        pool,
        `select count(*)::int as n
         from study_waves w join studies s on s.id = w.study_id
         where s.state = 'draft' and w.protocol_version_id is not null`,
      ),
    ).resolves.toBe(0);
  });

  it('publishes every version before the sessions that pin it, and every line before its studies', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_sessions s
         join protocol_versions v on v.id = s.protocol_version_id
         where v.published_at > s.started_at`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from studies st
         join protocols p on p.id = st.protocol_id
         where p.created_at > st.created_at`,
      ),
    ).resolves.toBe(0);
  });

  it('captures each session’s own version pin from its wave', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n
         from interview_sessions s
         join study_waves w on w.id = s.wave_id and w.team_id = s.team_id
         where s.protocol_version_id is distinct from w.protocol_version_id`,
      ),
    ).resolves.toBe(0);
  });

  it('keeps anonymous studies single-wave, participant-free and unattributed', async () => {
    const anonymous = await pool.query<{
      waves: number;
      participants: number;
      attributed: number;
      sessions: number;
      researcher_led: number;
    }>(
      `select
         (select count(*)::int from study_waves w where w.study_id = s.id) as waves,
         (select count(*)::int from participants p where p.study_id = s.id) as participants,
         (select count(*)::int from interview_sessions i
           where i.study_id = s.id and i.participant_id is not null) as attributed,
         (select count(*)::int from interview_sessions i where i.study_id = s.id) as sessions,
         (select count(*)::int from interview_sessions i
           where i.study_id = s.id and i.delivery_mode <> 'self_administered') as researcher_led
       from studies s where s.participation_mode = 'anonymous'`,
    );
    expect(anonymous.rows.length).toBeGreaterThan(0);
    for (const row of anonymous.rows) {
      expect(row.waves).toBe(1);
      expect(row.participants).toBe(0);
      expect(row.attributed).toBe(0);
      expect(row.researcher_led).toBe(0);
      expect(row.sessions).toBeGreaterThan(0);
    }
  });

  it('gives every session exactly one rollup row that agrees with its graph', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_sessions s
         where (select count(*) from session_stats st where st.session_id = s.id) <> 1`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from session_stats st
         where st.node_count
               <> (select count(*) from nodes n where n.session_id = st.session_id)
            or st.edge_count
               <> (select count(*) from edges e where e.session_id = st.session_id)`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from session_stats st
         where st.node_count <> coalesce(
           (select sum(h.node_count) from session_degree_hist h
             where h.session_id = st.session_id), 0)`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(pool, `select count(*)::int as n from session_degree_hist`),
    ).resolves.toBeGreaterThan(0);
  });

  it('freezes a snapshot for every completed session and for no other', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_sessions s
         where (select count(*) from session_snapshots sn where sn.session_id = s.id)
               <> (case when s.status = 'completed' then 1 else 0 end)`,
      ),
    ).resolves.toBe(0);
    const statuses = await pool.query<{ status: string }>(
      `select distinct status from interview_sessions order by status`,
    );
    expect(statuses.rows.map((row) => row.status)).toEqual([
      'abandoned',
      'completed',
      'in_progress',
    ]);
  });

  it('grants the creating admin a manager role on every study', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from studies s
         where not exists (
           select 1 from study_role_grants g
           where g.study_id = s.id and g.team_id = s.team_id
             and g.user_id = $1 and g.role = 'manager')`,
        [adminId],
      ),
    ).resolves.toBe(0);

    const roles = await pool.query<{ role: string }>(
      `select distinct role from study_role_grants order by role`,
    );
    expect(roles.rows.map((row) => row.role)).toEqual([
      'coordinator',
      'data_viewer',
      'manager',
      'protocol_designer',
    ]);
    // The PII flag is orthogonal to the role, so both values appear inside one
    // study rather than only across the corpus.
    await expect(
      count(
        pool,
        `select count(*)::int as n from (
           select study_id from study_role_grants
           group by study_id
           having bool_or(pii_access) and bool_or(not pii_access)) mixed`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('leaves participant PII columns null and codes well-formed', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from participants
         where num_nonnulls(email_ciphertext, phone_ciphertext, name_ciphertext,
                            attributes_ciphertext, email_index, phone_index,
                            pii_key_id, pii_algorithm) > 0`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from participants
         where participant_code !~ '^P-[0-9]{4}$' or enrolled_at is null`,
      ),
    ).resolves.toBe(0);
    // A southern-hemisphere zone is in the mix, so DST arithmetic has
    // something to bite on.
    await expect(
      count(
        pool,
        `select count(*)::int as n from participants
         where timezone in ('Australia/Sydney', 'Pacific/Auckland')`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('captures consent inside a session only where the participant interviewed, and never before it began', async () => {
    // Both shapes the column exists for appear: remote onboarding, captured
    // inside the participant's first session minutes after it started, and
    // researcher-led onboarding, captured outside any session.
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consents where session_id is not null`,
      ),
    ).resolves.toBeGreaterThan(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consents where session_id is null`,
      ),
    ).resolves.toBeGreaterThan(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consents c
         join interview_sessions s on s.id = c.session_id
         where s.participant_id is distinct from c.participant_id
            or c.granted_at < s.started_at
            or exists (
              select 1 from interview_sessions earlier
              where earlier.participant_id = c.participant_id
                and earlier.started_at < s.started_at)`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consents c
         where c.session_id is null
           and exists (select 1 from interview_sessions s
                       where s.participant_id = c.participant_id)`,
      ),
    ).resolves.toBe(0);
  });

  it('records consent for most participants, with withdrawals and declines', async () => {
    const consented = await count(
      pool,
      `select count(*)::int as n from participant_consents`,
    );
    expect(consented).toBeGreaterThan(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consents where withdrawn_at is not null`,
      ),
    ).resolves.toBeGreaterThan(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consent_item_responses r
         join consent_items i on i.id = r.consent_item_id
         where not r.affirmed and not i.required`,
      ),
    ).resolves.toBeGreaterThan(0);
    // A required item is never declined: the grant could not exist if it were.
    await expect(
      count(
        pool,
        `select count(*)::int as n from participant_consent_item_responses r
         join consent_items i on i.id = r.consent_item_id
         where not r.affirmed and i.required`,
      ),
    ).resolves.toBe(0);
    // One study carries a superseded v1 beside its published v2.
    await expect(
      count(
        pool,
        `select count(*)::int as n from (
           select study_id from consent_documents
           group by study_id
           having bool_or(state = 'retired') and bool_or(state = 'published')) supers`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('suppresses exactly the deliveries enqueued after their address opted out', async () => {
    // A suppressed delivery names an address that had opted out by the time
    // it was enqueued …
    await expect(
      count(
        pool,
        `select count(*)::int as n from message_deliveries d
         where d.suppressed_at is not null
           and not exists (
             select 1 from participant_contact_optouts o
             where o.team_id = d.team_id and o.channel = d.channel
               and o.recipient_blind_index = d.recipient_blind_index
               and o.opted_out_at <= d.created_at)`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from message_deliveries where suppressed_at is not null`,
      ),
    ).resolves.toBeGreaterThan(0);
    // … nothing enqueued after an opt-out went anywhere but the suppression
    // list, and what was enqueued before it went out as it would have.
    await expect(
      count(
        pool,
        `select count(*)::int as n from message_deliveries d
         join participant_contact_optouts o
           on o.team_id = d.team_id and o.channel = d.channel
          and o.recipient_blind_index = d.recipient_blind_index
         where o.opted_out_at <= d.created_at and d.suppressed_at is null`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from message_deliveries d
         join participant_contact_optouts o
           on o.team_id = d.team_id and o.channel = d.channel
          and o.recipient_blind_index = d.recipient_blind_index
         where o.opted_out_at > d.created_at and d.suppressed_at is null`,
      ),
    ).resolves.toBeGreaterThan(0);
    const events = await pool.query<{ kind: string }>(
      `select distinct kind from message_delivery_events order by kind`,
    );
    const kinds = events.rows.map((row) => row.kind);
    expect(kinds).toContain('bounced');
    expect(kinds).toContain('complained');
  });

  it('makes every service token answerable to an owner or admin of its team', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from api_tokens t
         where not exists (
           select 1 from team_members m
           where m.team_id = t.team_id and m.user_id = t.custodian_user_id
             and m.role in ('owner', 'admin'))
            or not exists (
           select 1 from team_members m
           where m.team_id = t.team_id and m.user_id = t.created_by_user_id
             and m.role in ('owner', 'admin'))`,
      ),
    ).resolves.toBe(0);
    const shapes = await pool.query<{
      readonly_no_pii: number;
      write_pii: number;
      study_scoped: number;
      revoked: number;
    }>(
      `select
         count(*) filter (where access_level = 'read' and not includes_pii)::int as readonly_no_pii,
         count(*) filter (where access_level = 'write' and includes_pii)::int as write_pii,
         count(*) filter (where scope_kind = 'study')::int as study_scoped,
         count(*) filter (where revoked_at is not null)::int as revoked
       from api_tokens`,
    );
    const shape = shapes.rows[0]!;
    expect(shape.readonly_no_pii).toBeGreaterThan(0);
    expect(shape.write_pii).toBeGreaterThan(0);
    expect(shape.study_scoped).toBeGreaterThan(0);
    expect(shape.revoked).toBeGreaterThan(0);
  });

  it('keeps the wave rollups equal to a recomputation from the sessions', async () => {
    // Written as joins and grouping rather than as the seed's scalar
    // subqueries, so this is a second expression of the definition rather than
    // the same query twice.
    const drift = await pool.query<{ wave_id: string }>(
      `with links as (
         select wave_id, count(*)::int as invited
         from interview_links group by wave_id
       ),
       sessions as (
         select wave_id,
                count(*)::int as started,
                count(*) filter (where status = 'completed')::int as completed,
                count(*) filter (where status = 'abandoned')::int as abandoned,
                count(distinct participant_id)::int as onboarding
         from interview_sessions group by wave_id
       ),
       consented as (
         select s.wave_id, count(distinct s.participant_id)::int as consented
         from interview_sessions s
         join participant_consents c
           on c.participant_id = s.participant_id and c.team_id = s.team_id
          and c.withdrawn_at is null
         group by s.wave_id
       ),
       failures as (
         select sc.wave_id, count(*)::int as failed
         from message_deliveries d
         join schedule_occurrences o on o.id = d.occurrence_id and o.team_id = d.team_id
         join study_schedules sc on sc.id = o.schedule_id and sc.team_id = o.team_id
         where d.failed_at is not null and sc.wave_id is not null
         group by sc.wave_id
       )
       select r.wave_id
       from study_wave_rollups r
       left join links l on l.wave_id = r.wave_id
       left join sessions s on s.wave_id = r.wave_id
       left join consented c on c.wave_id = r.wave_id
       left join failures f on f.wave_id = r.wave_id
       where r.invited_count is distinct from coalesce(l.invited, 0)
          or r.session_started_count is distinct from coalesce(s.started, 0)
          or r.session_completed_count is distinct from coalesce(s.completed, 0)
          or r.session_abandoned_count is distinct from coalesce(s.abandoned, 0)
          or r.onboarding_started_count is distinct from coalesce(s.onboarding, 0)
          or r.consented_count is distinct from coalesce(c.consented, 0)
          or r.delivery_failed_count is distinct from coalesce(f.failed, 0)`,
    );
    expect(drift.rows).toEqual([]);
    // One rollup per wave, and the numbers are not all zero.
    await expect(
      count(
        pool,
        `select count(*)::int as n from study_waves w
         where not exists (select 1 from study_wave_rollups r where r.wave_id = w.id)`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from study_wave_rollups
         where session_completed_count > 0`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('keeps the stage rollups equal to a recomputation from the nodes', async () => {
    const drift = await pool.query<{ wave_id: string; stage_id: string }>(
      `with entered as (
         select s.wave_id, n.stage_id, s.id as session_id, s.status,
                count(*) filter (where n.attributes = '{}'::jsonb)::int as missing
         from nodes n
         join interview_sessions s on s.id = n.session_id and s.team_id = n.team_id
         where n.stage_id is not null
         group by s.wave_id, n.stage_id, s.id, s.status
       ),
       expected as (
         select wave_id, stage_id,
                count(*)::int as entered_count,
                count(*) filter (where status = 'completed')::int as completed_count,
                count(*) filter (where status = 'abandoned')::int as abandoned_count,
                sum(missing)::int as missing_item_count
         from entered group by wave_id, stage_id
       )
       select r.wave_id, r.stage_id
       from study_stage_rollups r
       full join expected e
         on e.wave_id = r.wave_id and e.stage_id = r.stage_id
       where r.entered_count is distinct from e.entered_count
          or r.completed_count is distinct from e.completed_count
          or r.abandoned_count is distinct from e.abandoned_count
          or r.missing_item_count is distinct from e.missing_item_count
          or r.duration_ms_count is distinct from e.entered_count`,
    );
    expect(drift.rows).toEqual([]);
    await expect(
      count(pool, `select count(*)::int as n from study_stage_rollups`),
    ).resolves.toBeGreaterThan(0);
  });

  it('issues one live link per managed participant per collecting wave', async () => {
    // Every participant link belongs to a wave of a live or paused study, and
    // no participant holds two live links on one wave (the partial unique
    // index proves the second half; this proves the first).
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_links l
         join studies s on s.id = l.study_id and s.team_id = l.team_id
         where l.kind = 'participant' and s.state not in ('live', 'paused')`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n
         from study_waves w
         join studies s on s.id = w.study_id
         join participants p on p.study_id = s.id
         where s.state in ('live', 'paused') and s.participation_mode = 'managed'
           and not exists (
             select 1 from interview_links l
             where l.wave_id = w.id and l.participant_id = p.id
               and l.kind = 'participant')`,
      ),
    ).resolves.toBe(0);
    // Exactly one open link per anonymous study.
    await expect(
      count(
        pool,
        `select count(*)::int as n from studies s
         where s.participation_mode = 'anonymous'
           and (select count(*) from interview_links l
                 where l.study_id = s.id and l.kind = 'anonymous') <> 1`,
      ),
    ).resolves.toBe(0);
  });

  it('records on every link exactly the redemptions its sessions are', async () => {
    // A visit through a link is a session, so the link's count is its
    // session count and its last redemption the newest session's start — for
    // both kinds, and zero where no session cites the link.
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_links l
         left join (
           select link_id, count(*)::int as n, max(started_at) as newest
           from interview_sessions where link_id is not null group by link_id
         ) s on s.link_id = l.id
         where l.redemption_count <> coalesce(s.n, 0)
            or l.last_redeemed_at is distinct from s.newest`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_links
         where kind = 'anonymous' and redemption_count = 0`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_links
         where kind = 'participant' and redemption_count > 0`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('parks each in-progress session at a stage and each completed one past the last', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_sessions
         where status = 'in_progress' and current_stage_id is null`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_sessions
         where status = 'completed' and current_stage_id is not null`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from interview_sessions
         where status = 'in_progress'`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('writes assets whose recorded size and class match their content, and leaves a sweepable tail', async () => {
    await expect(
      count(
        pool,
        `select count(*)::int as n from assets
         where hash !~ '^[0-9a-f]{64}$' or byte_size <= 0 or origin <> 'seed'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from assets a
         where a.unreferenced_at is not null
           and exists (select 1 from asset_references r
                        where r.team_id = a.team_id and r.asset_hash = a.hash)`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from assets where unreferenced_at is not null`,
      ),
    ).resolves.toBeGreaterThan(0);
    await expect(
      count(pool, `select count(*)::int as n from asset_references`),
    ).resolves.toBeGreaterThan(0);
  });

  it('leaves every webhook delivery one its own subscription asked for', async () => {
    // The corpus still covers both subscription states, and reaches the
    // disabled one the way the dispatcher does: deliveries first, disablement
    // afterwards. Written the other way round, none of those deliveries could
    // exist — webhook_deliveries_subscription_wants_event admits a delivery
    // only while its subscription is active and only for a type it asks for.
    const states = await pool.query<{ state: string }>(
      `select distinct state from webhook_subscriptions order by state`,
    );
    expect(states.rows.map((row) => row.state)).toEqual(['active', 'disabled']);
    await expect(
      count(
        pool,
        `select count(*)::int as n from webhook_deliveries d
         join webhook_subscriptions s
           on s.id = d.subscription_id and s.team_id = d.team_id
         where not (d.event_type = any(s.event_types))`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `select count(*)::int as n from webhook_deliveries d
         join webhook_subscriptions s
           on s.id = d.subscription_id and s.team_id = d.team_id
         where s.state = 'disabled'`,
      ),
    ).resolves.toBeGreaterThan(0);
  });

  it('appends a dense audit sequence per team and no unbacked outbox rows', async () => {
    const sequences = await pool.query<{ team_id: string; ok: boolean }>(
      `select team_id,
              (min(sequence) = 1 and max(sequence) = count(*)) as ok
       from audit_events group by team_id`,
    );
    expect(sequences.rows.length).toBeGreaterThan(0);
    expect(sequences.rows.every((row) => row.ok)).toBe(true);
    // Neither outbox has a production writer yet, so the seed leaves both
    // empty rather than inventing rows that bypass invariants no code states.
    await expect(
      count(pool, `select count(*)::int as n from audit_alert_outbox`),
    ).resolves.toBe(0);
    await expect(
      count(pool, `select count(*)::int as n from audit_export_jobs`),
    ).resolves.toBe(0);
  });
});

describe.skipIf(!db)('seed', () => {
  it(
    'creates an admin who can sign in with the published password and owns every team',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { pool, dispose } = await createScratchSchema(db);
      try {
        await provisionScratchSchema(pool);
        await seed(pool);

        const admin = await pool.query<{
          id: string;
          name: string;
          emailVerified: boolean;
        }>(`select id, name, "emailVerified" from "user" where email = $1`, [
          SEED_ADMIN_EMAIL,
        ]);
        expect(admin.rows).toEqual([
          {
            id: expect.any(String),
            name: SEED_ADMIN_NAME,
            emailVerified: true,
          },
        ]);
        const adminId = admin.rows[0]!.id;

        const account = await pool.query<{ password: string | null }>(
          `select password from account where "userId" = $1 and "providerId" = 'credential'`,
          [adminId],
        );
        expect(account.rows).toHaveLength(1);
        const hash = account.rows[0]!.password;
        expect(hash).not.toBeNull();
        await expect(
          verifyPassword({ hash: hash!, password: SEED_ADMIN_PASSWORD }),
        ).resolves.toBe(true);
        await expect(
          verifyPassword({ hash: hash!, password: 'not the password' }),
        ).resolves.toBe(false);

        const teams = await pool.query<{ count: number }>(
          `select count(*)::int as count from teams`,
        );
        const adminMemberships = await pool.query<{ role: string }>(
          `select role from team_members where user_id = $1`,
          [adminId],
        );
        expect(adminMemberships.rows).toHaveLength(teams.rows[0]!.count);
        expect(adminMemberships.rows.every((row) => row.role === 'owner')).toBe(
          true,
        );

        const otherMembers = await pool.query<{ role: string }>(
          `select role from team_members where user_id <> $1`,
          [adminId],
        );
        expect(otherMembers.rows.length).toBeGreaterThan(0);
        const otherRoles = new Set(otherMembers.rows.map((row) => row.role));
        expect(otherRoles).not.toContain('owner');
        for (const role of otherRoles) {
          expect(TEAM_ROLES).toContain(role);
        }
      } finally {
        await dispose();
      }
    },
    SEEDING_TIMEOUT_MS,
  );

  it(
    'leaves the previous dataset untouched when a reseed fails part-way',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { pool, dispose } = await createScratchSchema(db);
      try {
        await provisionScratchSchema(pool);
        await seed(pool);
        const before = await pool.query(
          `select id, name, slug from teams order by slug`,
        );
        const studiesBefore = await count(
          pool,
          `select count(*)::int as n from studies`,
        );

        // Fails the reseed once it is well underway: after the wipe, the admin
        // and the first team's memberships have already been written.
        await pool.query(`
        create function seed_test_fail() returns trigger language plpgsql as $$
        begin
          if (select count(*) from team_members) >= 3 then
            raise exception 'seed_test_fail';
          end if;
          return new;
        end $$;
        create trigger seed_test_fail before insert on team_members
          for each row execute function seed_test_fail();
      `);
        await expect(seed(pool)).rejects.toThrow('seed_test_fail');
        await pool.query(`drop trigger seed_test_fail on team_members`);

        const after = await pool.query(
          `select id, name, slug from teams order by slug`,
        );
        expect(after.rows).toEqual(before.rows);
        // The whole populated model rolls back with it, not only the teams.
        await expect(
          count(pool, `select count(*)::int as n from studies`),
        ).resolves.toBe(studiesBefore);
      } finally {
        await dispose();
      }
    },
    SEEDING_TIMEOUT_MS,
  );

  it(
    'hashes a per-instance admin password when one is given',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { pool, dispose } = await createScratchSchema(db);
      try {
        await provisionScratchSchema(pool);
        await seed(pool, { adminPassword: 'chosen-for-this-instance' });

        const account = await pool.query<{ password: string }>(
          `select password from account
         where "providerId" = 'credential'
           and "userId" = (select id from "user" where email = $1)`,
          [SEED_ADMIN_EMAIL],
        );
        const hash = account.rows[0]!.password;
        await expect(
          verifyPassword({ hash, password: 'chosen-for-this-instance' }),
        ).resolves.toBe(true);
        await expect(
          verifyPassword({ hash, password: SEED_ADMIN_PASSWORD }),
        ).resolves.toBe(false);
      } finally {
        await dispose();
      }
    },
    SEEDING_TIMEOUT_MS,
  );

  it(
    'wipes prior data so re-seeding never collides on unique constraints',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { pool, dispose } = await createScratchSchema(db);
      try {
        await provisionScratchSchema(pool);
        await seed(pool);
        const firstRun = await pool.query(
          `select name, slug from teams order by slug`,
        );

        // Re-seeding must not error on the unique constraints (team slug, user
        // email, token hash, participant code) a naive additive seed would
        // collide on the second time around.
        await expect(seed(pool)).resolves.toBeUndefined();
        const secondRun = await pool.query(
          `select name, slug from teams order by slug`,
        );
        expect(secondRun.rows).toEqual(firstRun.rows);
      } finally {
        await dispose();
      }
    },
    SEEDING_TIMEOUT_MS,
  );

  it(
    'produces byte-identical data in two independently seeded schemas',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const first = await createScratchSchema(db);
      const second = await createScratchSchema(db);
      try {
        await provisionScratchSchema(first.pool);
        await provisionScratchSchema(second.pool);
        await seed(first.pool);
        await seed(second.pool);

        const left = await dumpEverything(first.pool);
        const right = await dumpEverything(second.pool);

        // The dump has to be worth comparing: an empty one would make every
        // assertion below vacuous.
        expect(left.size).toBeGreaterThan(40);
        expect((left.get('nodes') ?? '').length).toBeGreaterThan(10_000);
        expect((left.get('studies') ?? '').length).toBeGreaterThan(1_000);
        expect([...left.keys()]).toEqual([...right.keys()]);

        // Compared by table, and asserted as a boolean: a jsonb dump of 26 000
        // nodes printed as a diff would bury the name of the table that drifted.
        for (const [table, dump] of left) {
          expect(
            dump === right.get(table),
            `${table} differs between two seeded schemas`,
          ).toBe(true);
        }
      } finally {
        await Promise.all([first.dispose(), second.dispose()]);
      }
    },
    SEEDING_TIMEOUT_MS,
  );
});
