// The experiment module's database-enforced promises: the variant list and
// lifecycle checks on an experiment, one sticky assignment per subject, the
// composite foreign keys that keep an assignment and its exposures inside one
// team, and the two sidecar triggers that make an assignment and an exposure
// unrewritable while leaving the erasure delete path open.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
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

const TWO_VARIANTS = JSON.stringify([
  { key: 'control', weight: 1 },
  { key: 'treatment', weight: 1 },
]);

describe.skipIf(!db)('experiment schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One experiment per team, so cross-team pins have a target. */
  const experimentOf: Record<string, string> = {};
  /** One assignment per team, for the exposure pins. */
  const assignmentOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers: exactly the fixture tool
  // these cases want. Role-sensitive probes use the `app` pool instead.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const experimentRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    key: `layout_${randomUUID().slice(0, 8)}`,
    name: 'Sociogram layout affordance',
    surface: 'researcher',
    variants: TWO_VARIANTS,
    ...overrides,
  });

  const assignmentRow = (experimentId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    experiment_id: experimentId,
    subject_kind: 'user',
    subject_id: `user-${randomUUID().slice(0, 8)}`,
    variant_key: 'control',
    ...overrides,
  });

  const exposureRow = (
    experimentId: string,
    assignmentId: string,
    overrides: Row = {},
  ): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    experiment_id: experimentId,
    assignment_id: assignmentId,
    variant_key: 'control',
    surface_key: 'sociogram.layout',
    ...overrides,
  });

  async function newExperiment(overrides: Row = {}): Promise<string> {
    const row = experimentRow(overrides);
    await insert('experiments', row);
    return row.id as string;
  }

  async function newAssignment(
    experimentId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = assignmentRow(experimentId, overrides);
    await insert('experiment_assignments', row);
    return row.id as string;
  }

  async function newExposure(
    experimentId: string,
    assignmentId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = exposureRow(experimentId, assignmentId, overrides);
    await insert('experiment_exposures', row);
    return row.id as string;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const experimentId = randomUUID();
      experimentOf[teamId] = experimentId;
      await insert(
        'experiments',
        experimentRow({ id: experimentId, team_id: teamId }),
      );
      const assignmentId = randomUUID();
      assignmentOf[teamId] = assignmentId;
      await insert(
        'experiment_assignments',
        assignmentRow(experimentId, { id: assignmentId, team_id: teamId }),
      );
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('experiments', () => {
    it('applies the documented defaults', async () => {
      const id = await newExperiment();

      const row = await pool.query<Row>(
        `SELECT state, started_at, stopped_at FROM experiments WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]).toEqual({
        state: 'draft',
        started_at: null,
        stopped_at: null,
      });
    });

    it.each([
      ['an unknown surface', { surface: 'admin' }, 'experiments_surface_check'],
      ['an unknown state', { state: 'archived' }, 'experiments_state_check'],
      [
        'a draft carrying a start timestamp',
        { started_at: new Date() },
        'experiments_state_check',
      ],
      [
        'a running experiment that never started',
        { state: 'running' },
        'experiments_state_check',
      ],
      [
        'a stopped experiment with no stop timestamp',
        { state: 'stopped', started_at: new Date() },
        'experiments_state_check',
      ],
      [
        'a stop timestamp on a running experiment',
        { state: 'running', started_at: new Date(), stopped_at: new Date() },
        'experiments_state_check',
      ],
      [
        'a single-variant experiment',
        { variants: JSON.stringify([{ key: 'control', weight: 1 }]) },
        'experiments_variants_check',
      ],
      [
        'more than ten variants',
        {
          variants: JSON.stringify(
            Array.from({ length: 11 }, (_, i) => ({ key: `v${i}`, weight: 1 })),
          ),
        },
        'experiments_variants_check',
      ],
      [
        'an object where the variant list belongs',
        { variants: JSON.stringify({ control: 1, treatment: 1 }) },
        'experiments_variants_check',
      ],
      [
        'a key that starts with a digit',
        { key: '1layout' },
        'experiments_key_check',
      ],
      ['a one-character key', { key: 'a' }, 'experiments_key_check'],
      ['an upper-case key', { key: 'Layout' }, 'experiments_key_check'],
      [
        'a key past 64 characters',
        { key: `a${'b'.repeat(64)}` },
        'experiments_key_check',
      ],
      ['a blank name', { name: '' }, 'experiments_key_check'],
      [
        'a name past 200 characters',
        { name: 'n'.repeat(201) },
        'experiments_key_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('experiments', experimentRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('accepts the lifecycle states the checks exist to admit', async () => {
      await expect(
        insert(
          'experiments',
          experimentRow({ state: 'running', started_at: new Date() }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert(
          'experiments',
          experimentRow({
            state: 'stopped',
            started_at: new Date(),
            stopped_at: new Date(),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert('experiments', experimentRow({ surface: 'participant' })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('keeps one experiment per key per team', async () => {
      const key = `layout_${randomUUID().slice(0, 8)}`;
      await newExperiment({ key });

      await expect(
        insert('experiments', experimentRow({ key })),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'experiments_team_id_key_unique',
      });
      // The key is namespaced by team, so another team may reuse it.
      await expect(
        insert('experiments', experimentRow({ key, team_id: TEAM_B })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('experiment_assignments', () => {
    it.each([
      [
        'an unknown subject kind',
        { subject_kind: 'device' },
        'experiment_assignments_subject_kind_check',
      ],
      [
        'an empty subject id',
        { subject_id: '' },
        'experiment_assignments_lengths_check',
      ],
      [
        'a subject id past 255 characters',
        { subject_id: 's'.repeat(256) },
        'experiment_assignments_lengths_check',
      ],
      [
        'an upper-case variant key',
        { variant_key: 'Control' },
        'experiment_assignments_lengths_check',
      ],
      [
        'a variant key that starts with a digit',
        { variant_key: '1control' },
        'experiment_assignments_lengths_check',
      ],
      [
        'a variant key past 64 characters',
        { variant_key: `a${'b'.repeat(64)}` },
        'experiment_assignments_lengths_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert(
          'experiment_assignments',
          assignmentRow(experimentOf[TEAM_A] as string, overrides),
        ),
      ).rejects.toMatchObject({ constraint });
    });

    it('allows one assignment per subject per experiment', async () => {
      const experimentId = await newExperiment();
      const subjectId = `user-${randomUUID().slice(0, 8)}`;
      await newAssignment(experimentId, { subject_id: subjectId });

      await expect(
        insert(
          'experiment_assignments',
          assignmentRow(experimentId, {
            subject_id: subjectId,
            variant_key: 'treatment',
          }),
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint:
          'experiment_assignments_experiment_id_subject_kind_subject_id_un',
      });

      // The subject is (kind, id): the same opaque id under another kind is a
      // different subject and may be assigned independently.
      await expect(
        insert(
          'experiment_assignments',
          assignmentRow(experimentId, {
            subject_id: subjectId,
            subject_kind: 'session',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      // As is the same subject in another experiment.
      await expect(
        insert(
          'experiment_assignments',
          assignmentRow(await newExperiment(), { subject_id: subjectId }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses an experiment from another team', async () => {
      await expect(
        insert(
          'experiment_assignments',
          assignmentRow(experimentOf[TEAM_B] as string, { team_id: TEAM_A }),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'experiment_assignments_experiment_fk',
        detail: expect.stringContaining(
          'is not present in table "experiments"',
        ),
      });
    });

    it.each([
      ['the variant', `variant_key = 'treatment'`],
      ['the subject', `subject_id = 'someone-else'`],
      ['the subject kind', `subject_kind = 'session'`],
      ['the assignment timestamp', `assigned_at = now()`],
    ])('never re-rolls %s', async (_label, assignment) => {
      const id = await newAssignment(experimentOf[TEAM_A] as string);

      await expect(
        pool.query(
          `UPDATE experiment_assignments SET ${assignment} WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow('experiment assignments are immutable');
    });

    it('leaves the erasure delete path open', async () => {
      const id = await newAssignment(experimentOf[TEAM_A] as string);

      // The trigger is UPDATE-only on purpose: participant erasure has to be
      // able to remove a subject's assignment outright.
      const deleted = await pool.query(
        `DELETE FROM experiment_assignments WHERE id = $1`,
        [id],
      );
      expect(deleted.rowCount).toBe(1);
    });
  });

  describe('experiment_exposures', () => {
    it('applies the documented defaults', async () => {
      const id = await newExposure(
        experimentOf[TEAM_A] as string,
        assignmentOf[TEAM_A] as string,
      );

      const row = await pool.query<{ details: unknown; occurred_at: Date }>(
        `SELECT details, occurred_at FROM experiment_exposures WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]?.details).toEqual({});
      expect(row.rows[0]?.occurred_at).toBeInstanceOf(Date);
    });

    it.each([
      [
        'scalar details',
        { details: JSON.stringify(3) },
        'experiment_exposures_details_check',
      ],
      [
        'details past two kibibytes',
        { details: JSON.stringify({ blob: 'x'.repeat(4000) }) },
        'experiment_exposures_details_check',
      ],
      [
        'an empty surface key',
        { surface_key: '' },
        'experiment_exposures_lengths_check',
      ],
      [
        'a surface key past 128 characters',
        { surface_key: 's'.repeat(129) },
        'experiment_exposures_lengths_check',
      ],
      [
        'an upper-case variant key',
        { variant_key: 'Control' },
        'experiment_exposures_lengths_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert(
          'experiment_exposures',
          exposureRow(
            experimentOf[TEAM_A] as string,
            assignmentOf[TEAM_A] as string,
            overrides,
          ),
        ),
      ).rejects.toMatchObject({ constraint });
    });

    it('refuses an assignment from another team', async () => {
      await expect(
        insert(
          'experiment_exposures',
          exposureRow(
            experimentOf[TEAM_A] as string,
            assignmentOf[TEAM_B] as string,
            { team_id: TEAM_A },
          ),
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'experiment_exposures_assignment_fk',
        detail: expect.stringContaining(
          'is not present in table "experiment_assignments"',
        ),
      });
    });

    it.each([
      ['the variant', `variant_key = 'treatment'`],
      ['the surface', `surface_key = 'sociogram.other'`],
      ['the details', `details = '{"tampered":true}'::jsonb`],
      ['the timestamp', `occurred_at = now()`],
    ])('never rewrites %s of a logged exposure', async (_label, assignment) => {
      const id = await newExposure(
        experimentOf[TEAM_A] as string,
        assignmentOf[TEAM_A] as string,
      );

      // The exposure trigger reuses the assignment guard's function, so it
      // raises the assignment message.
      await expect(
        pool.query(
          `UPDATE experiment_exposures SET ${assignment} WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow('experiment assignments are immutable');
    });

    it('leaves the erasure delete path open', async () => {
      const id = await newExposure(
        experimentOf[TEAM_A] as string,
        assignmentOf[TEAM_A] as string,
      );

      const deleted = await pool.query(
        `DELETE FROM experiment_exposures WHERE id = $1`,
        [id],
      );
      expect(deleted.rowCount).toBe(1);
    });
  });

  it('shows a team only its own experiments', async () => {
    const visible = await tenantA.query(
      `SELECT DISTINCT team_id FROM experiments`,
    );
    expect(visible.rows).toEqual([{ team_id: TEAM_A }]);

    await expect(
      tenantA.query(
        `INSERT INTO experiments (id, team_id, key, name, surface, variants)
         VALUES ($1, $2, $3, 'Cross-tenant', 'researcher', $4::jsonb)`,
        [
          randomUUID(),
          TEAM_B,
          `layout_${randomUUID().slice(0, 8)}`,
          TWO_VARIANTS,
        ],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
