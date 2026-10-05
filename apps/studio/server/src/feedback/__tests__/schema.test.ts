// The feedback module's database-enforced promises: the consent gate that
// makes stored context structural rather than a form-layer promise, the
// reporter/kind/triage-state checks, and the composite foreign key that keeps
// a report and the study it names inside one team.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK or foreign-key violation — so a guard that stopped firing
// cannot pass as "no error".
import { randomUUID } from 'node:crypto';

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

const CONTEXT = JSON.stringify({
  route: '/studies/1/monitor',
  stageId: 'stage-3',
  appVersion: '0.2.0',
});

describe.skipIf(!db)('feedback schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One study per team, for the optional study reference. */
  const studyOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the checks: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` pool instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const reportRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    reporter_kind: 'anonymous',
    kind: 'bug',
    body: 'The sociogram froze after the third prompt.',
    ...overrides,
  });

  async function newReport(overrides: Row = {}): Promise<string> {
    const row = reportRow(overrides);
    await insert('feedback_reports', row);
    return row.id as string;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const studyId = randomUUID();
      studyOf[teamId] = studyId;
      await insert('studies', {
        id: studyId,
        team_id: teamId,
        name: `${teamId} study`,
      });
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  it('applies the documented defaults', async () => {
    const id = await newReport();

    const row = await pool.query<Row>(
      `SELECT study_id, reporter_user_id, context, context_consent, state,
              external_ref, triaged_at
       FROM feedback_reports WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({
      study_id: null,
      reporter_user_id: null,
      context: {},
      context_consent: false,
      state: 'new',
      external_ref: null,
      triaged_at: null,
    });
  });

  describe('the context consent gate', () => {
    it('refuses to store context the reporter did not agree to send', async () => {
      await expect(
        insert(
          'feedback_reports',
          reportRow({ context: CONTEXT, context_consent: false }),
        ),
      ).rejects.toMatchObject({
        constraint: 'feedback_reports_context_consent_check',
      });
    });

    it('stores context once the box is checked', async () => {
      const id = await newReport({
        context: CONTEXT,
        context_consent: true,
      });

      const row = await pool.query<{ context: Record<string, unknown> }>(
        `SELECT context FROM feedback_reports WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]?.context).toMatchObject({
        route: '/studies/1/monitor',
        stageId: 'stage-3',
      });
    });

    it('admits a consent-less report that carries no context', async () => {
      await expect(
        insert(
          'feedback_reports',
          reportRow({ context: '{}', context_consent: false }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses to withdraw consent while the context is still stored', async () => {
      const id = await newReport({ context: CONTEXT, context_consent: true });

      await expect(
        pool.query(
          `UPDATE feedback_reports SET context_consent = false WHERE id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({
        constraint: 'feedback_reports_context_consent_check',
      });

      // Withdrawal is only ever consent plus erasure, in one statement.
      await expect(
        pool.query(
          `UPDATE feedback_reports
           SET context_consent = false, context = '{}'::jsonb
           WHERE id = $1`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  it.each([
    [
      'an unknown reporter kind',
      { reporter_kind: 'bot' },
      'feedback_reports_reporter_kind_check',
    ],
    [
      'a user report with no user id',
      { reporter_kind: 'user' },
      'feedback_reports_reporter_kind_check',
    ],
    [
      'a user id on an anonymous report',
      { reporter_user_id: 'user-1' },
      'feedback_reports_reporter_kind_check',
    ],
    [
      'a user id on a participant report',
      { reporter_kind: 'participant', reporter_user_id: 'user-1' },
      'feedback_reports_reporter_kind_check',
    ],
    ['an unknown kind', { kind: 'praise' }, 'feedback_reports_kind_check'],
    ['an unknown state', { state: 'wontfix' }, 'feedback_reports_state_check'],
    [
      'a new report that is already triaged',
      { triaged_at: new Date() },
      'feedback_reports_state_check',
    ],
    [
      'a triaged report with no triage timestamp',
      { state: 'triaged' },
      'feedback_reports_state_check',
    ],
    [
      'a scalar context',
      { context: JSON.stringify('everything'), context_consent: true },
      'feedback_reports_context_object_check',
    ],
    [
      'a context past four kibibytes',
      {
        context: JSON.stringify({ blob: 'x'.repeat(8000) }),
        context_consent: true,
      },
      'feedback_reports_context_object_check',
    ],
    ['an empty body', { body: '' }, 'feedback_reports_lengths_check'],
    ['a blank body', { body: '   ' }, 'feedback_reports_lengths_check'],
    [
      'a body past 5000 characters',
      { body: 'b'.repeat(5001) },
      'feedback_reports_lengths_check',
    ],
    [
      'an empty external reference',
      { external_ref: '' },
      'feedback_reports_lengths_check',
    ],
    [
      'an external reference past 500 characters',
      { external_ref: 'r'.repeat(501) },
      'feedback_reports_lengths_check',
    ],
    [
      'a reporter id past 255 characters',
      { reporter_kind: 'user', reporter_user_id: 'u'.repeat(256) },
      'feedback_reports_lengths_check',
    ],
  ])('rejects %s', async (_label, overrides, constraint) => {
    await expect(
      insert('feedback_reports', reportRow(overrides)),
    ).rejects.toMatchObject({ constraint });
  });

  it('accepts the shapes the checks exist to admit', async () => {
    await expect(
      insert(
        'feedback_reports',
        reportRow({ reporter_kind: 'user', reporter_user_id: 'user-1' }),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      insert('feedback_reports', reportRow({ reporter_kind: 'participant' })),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      insert('feedback_reports', reportRow({ kind: 'suggestion' })),
    ).resolves.toMatchObject({ rowCount: 1 });
    for (const state of ['triaged', 'forwarded', 'closed']) {
      await expect(
        insert(
          'feedback_reports',
          reportRow({
            state,
            triaged_at: new Date(),
            external_ref: 'https://github.example/org/repo/issues/1',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    }
  });

  it('accepts a report against the reporting team’s own study', async () => {
    await expect(
      insert('feedback_reports', reportRow({ study_id: studyOf[TEAM_A] })),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses a study from another team', async () => {
    await expect(
      insert(
        'feedback_reports',
        reportRow({ team_id: TEAM_A, study_id: studyOf[TEAM_B] }),
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'feedback_reports_study_fk',
      detail: expect.stringContaining('is not present in table "studies"'),
    });
  });

  it('shows a team only its own reports', async () => {
    await insert('feedback_reports', reportRow({ team_id: TEAM_B }));

    const visible = await tenantA.query(
      `SELECT DISTINCT team_id FROM feedback_reports`,
    );
    expect(visible.rows).toEqual([{ team_id: TEAM_A }]);

    await expect(
      tenantA.query(
        `INSERT INTO feedback_reports (id, team_id, reporter_kind, kind, body)
         VALUES ($1, $2, 'anonymous', 'bug', 'cross-tenant')`,
        [randomUUID(), TEAM_B],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
