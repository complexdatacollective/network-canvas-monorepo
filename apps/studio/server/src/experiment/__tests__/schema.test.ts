// The experiment module's database-enforced promises: the variant list and
// lifecycle checks on an experiment, the element-level proof that makes the
// list a list of arms, one sticky assignment per subject, the composite
// foreign keys that keep an assignment and its exposures inside one team, and
// the sidecar triggers that make an assignment and an exposure unrewritable
// and undeletable while leaving the erasure delete path open.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { ERASURE_GUC } from '../../study/schema.ts';

const db = await reachableDb();

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

const TWO_VARIANTS = JSON.stringify([
  { key: 'control', weight: 1 },
  { key: 'treatment', weight: 1 },
]);
const THREE_VARIANTS = JSON.stringify([
  { key: 'control', weight: 1 },
  { key: 'treatment', weight: 1 },
  { key: 'treatment_b', weight: 1 },
]);

describe.skipIf(!db)('experiment schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
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

  /**
   * The audited participant-erasure path: the application role, with the
   * transaction-scoped marker naming the participant whose data is being
   * removed. Erasure runs as `studio_app`, the same role as any buggy delete,
   * so the marker is the only thing that distinguishes it.
   */
  function erasing(participantId: string, sql: string, values: unknown[]) {
    return tenantA.transaction(async (client) => {
      await client.query(
        `SET LOCAL ${ERASURE_GUC} = ${pg.escapeLiteral(participantId)}`,
      );
      return client.query(sql, values);
    });
  }

  /** An assignment of a participant subject, which erasure can reach. */
  async function newParticipantAssignment(
    participantId: string,
  ): Promise<string> {
    return newAssignment(experimentOf[TEAM_A] as string, {
      subject_kind: 'participant',
      subject_id: participantId,
    });
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
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

    // `experiments_variants_check` sees an array of the right length and
    // stops. Every shape below satisfies it, and every one of them would
    // corrupt the randomiser that reads the list as a set of arms.
    it.each([
      [
        'a list of nulls',
        JSON.stringify([null, null]),
        'every experiment variant must be an object carrying a key and a weight',
      ],
      [
        'bare strings where the arms belong',
        JSON.stringify(['control', 'treatment']),
        'every experiment variant must be an object carrying a key and a weight',
      ],
      [
        'a nested list',
        JSON.stringify([
          ['control', 1],
          ['treatment', 1],
        ]),
        'every experiment variant must be an object carrying a key and a weight',
      ],
      [
        'an arm with no key',
        JSON.stringify([{ weight: 1 }, { key: 'treatment', weight: 1 }]),
        'the experiment variant key (missing) is not a well-formed key',
      ],
      [
        'a null key',
        JSON.stringify([
          { key: null, weight: 1 },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant key (missing) is not a well-formed key',
      ],
      [
        'an upper-case key',
        JSON.stringify([
          { key: 'Control', weight: 1 },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant key Control is not a well-formed key',
      ],
      [
        'a key that starts with a digit',
        JSON.stringify([
          { key: '1control', weight: 1 },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant key 1control is not a well-formed key',
      ],
      [
        'a key past 64 characters',
        JSON.stringify([
          { key: `a${'b'.repeat(64)}`, weight: 1 },
          { key: 'treatment', weight: 1 },
        ]),
        `the experiment variant key a${'b'.repeat(64)} is not a well-formed key`,
      ],
      [
        'two arms under one key',
        JSON.stringify([
          { key: 'control', weight: 1 },
          { key: 'control', weight: 2 },
        ]),
        'the experiment variant key control is used twice',
      ],
      [
        'a zero weight',
        JSON.stringify([
          { key: 'control', weight: 0 },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant control must carry a positive integer weight',
      ],
      [
        'a negative weight',
        JSON.stringify([
          { key: 'control', weight: -1 },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant control must carry a positive integer weight',
      ],
      [
        'a fractional weight',
        JSON.stringify([
          { key: 'control', weight: 1.5 },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant control must carry a positive integer weight',
      ],
      [
        'a weight written as a string',
        JSON.stringify([
          { key: 'control', weight: '1' },
          { key: 'treatment', weight: 1 },
        ]),
        'the experiment variant control must carry a positive integer weight',
      ],
      [
        'an arm with no weight at all',
        JSON.stringify([{ key: 'control' }, { key: 'treatment', weight: 1 }]),
        'the experiment variant control must carry a positive integer weight',
      ],
    ])('refuses %s', async (_label, variants, message) => {
      await expect(
        insert('experiments', experimentRow({ variants })),
      ).rejects.toThrow(message);
    });

    it('accepts the arm shapes the guard exists to admit', async () => {
      await expect(
        insert(
          'experiments',
          experimentRow({
            variants: JSON.stringify([
              { key: 'control', weight: 1 },
              { key: 'layout.dense-2_b', weight: 7 },
              { key: 'treatment', weight: 100 },
            ]),
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('proves every arm of a redrafted list too', async () => {
      const id = await newExperiment();

      await expect(
        pool.query(`UPDATE experiments SET variants = $2 WHERE id = $1`, [
          id,
          JSON.stringify([
            { key: 'control', weight: 1 },
            { key: 'control', weight: 1 },
          ]),
        ]),
      ).rejects.toThrow('the experiment variant key control is used twice');
    });

    it('freezes the variants once the experiment has started', async () => {
      const id = await newExperiment();
      const setVariants = (variants: string) =>
        pool.query(`UPDATE experiments SET variants = $2 WHERE id = $1`, [
          id,
          variants,
        ]);

      // A draft is still being designed.
      await expect(setVariants(THREE_VARIANTS)).resolves.toMatchObject({
        rowCount: 1,
      });
      await pool.query(
        `UPDATE experiments SET state = 'running', started_at = now() WHERE id = $1`,
        [id],
      );
      await expect(setVariants(TWO_VARIANTS)).rejects.toThrow(
        'the variants of an experiment that has started are immutable',
      );
      // Two BEFORE UPDATE triggers watch this column and fire in name order,
      // so a started experiment is refused as immutable rather than critiqued
      // for the contents of a list it may not carry anyway.
      await expect(
        setVariants(JSON.stringify([{ key: 'control', weight: 0 }])),
      ).rejects.toThrow(
        'the variants of an experiment that has started are immutable',
      );
      // Everything else about a running experiment still moves.
      await expect(
        pool.query(
          `UPDATE experiments SET state = 'stopped', stopped_at = now() WHERE id = $1`,
          [id],
        ),
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

    it('refuses a variant the experiment does not define', async () => {
      await expect(
        newAssignment(experimentOf[TEAM_A] as string, {
          variant_key: 'placebo',
        }),
      ).rejects.toThrow(
        "variant placebo is not one of the experiment's variants",
      );
      await expect(
        newAssignment(experimentOf[TEAM_A] as string, {
          variant_key: 'treatment',
        }),
      ).resolves.toMatch(/^[0-9a-f-]{36}$/);
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
      const participantId = randomUUID();
      const id = await newParticipantAssignment(participantId);

      // Immutability stops at UPDATE on purpose: participant erasure has to be
      // able to remove a subject's assignment outright. It presents the marker
      // to say so, and the marker names this assignment's own subject.
      await expect(
        erasing(
          participantId,
          `DELETE FROM experiment_assignments WHERE id = $1`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('lets the maintenance purge delete without a marker', async () => {
      const id = await newAssignment(experimentOf[TEAM_A] as string);

      await expect(
        maintenance.query(`DELETE FROM experiment_assignments WHERE id = $1`, [
          id,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses an unmarked delete, so a variant cannot be re-rolled', async () => {
      const subjectId = `user-${randomUUID().slice(0, 8)}`;
      const id = await newAssignment(experimentOf[TEAM_A] as string, {
        subject_id: subjectId,
      });

      // Without this, deleting and reinserting is a way round the sticky
      // assignment the unique key and the immutability trigger exist to keep.
      await expect(
        pool.query(`DELETE FROM experiment_assignments WHERE id = $1`, [id]),
      ).rejects.toThrow(
        'experiment assignments are deleted only by an audited erasure or the maintenance purge',
      );
      const survivor = await pool.query<{ variant_key: string }>(
        `SELECT variant_key FROM experiment_assignments WHERE id = $1`,
        [id],
      );
      expect(survivor.rows).toEqual([{ variant_key: 'control' }]);
    });

    it('proves the marker against the assignment it deletes', async () => {
      const participantId = randomUUID();
      const target = await newParticipantAssignment(participantId);
      const bystander = await newParticipantAssignment(randomUUID());

      await expect(
        erasing(
          participantId,
          `DELETE FROM experiment_assignments WHERE id = ANY($1::uuid[])`,
          [[target, bystander]],
        ),
      ).rejects.toThrow(
        'experiment assignments are deleted only by an audited erasure or the maintenance purge',
      );
    });

    it('refuses a marker that names a subject of another kind', async () => {
      // A researcher's assignment belongs to no participant, so no erasure
      // may reach it however the marker is spelled.
      const subjectId = randomUUID();
      const id = await newAssignment(experimentOf[TEAM_A] as string, {
        subject_kind: 'user',
        subject_id: subjectId,
      });

      await expect(
        erasing(subjectId, `DELETE FROM experiment_assignments WHERE id = $1`, [
          id,
        ]),
      ).rejects.toThrow(
        'experiment assignments are deleted only by an audited erasure or the maintenance purge',
      );
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

    it('binds an exposure to its assignment’s experiment and arm', async () => {
      const experimentId = experimentOf[TEAM_A] as string;
      const assignmentId = assignmentOf[TEAM_A] as string;
      const otherExperimentId = await newExperiment();

      // The assignment is `control` on `experimentId`. Filed under another
      // experiment of the same team, or under another arm, the exposure would
      // be counted where its subject was never assigned.
      await expect(
        newExposure(otherExperimentId, assignmentId),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'experiment_exposures_assignment_fk',
      });
      await expect(
        newExposure(experimentId, assignmentId, { variant_key: 'treatment' }),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'experiment_exposures_assignment_fk',
      });
      await expect(newExposure(experimentId, assignmentId)).resolves.toMatch(
        /^[0-9a-f-]{36}$/,
      );
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
      const participantId = randomUUID();
      const assignmentId = await newParticipantAssignment(participantId);
      await newExposure(experimentOf[TEAM_A] as string, assignmentId);

      // An exposure carries no subject of its own, so the marker is proven
      // through the assignment it was logged against — and the exposures must
      // go first, because the composite key holds the assignment in place
      // while any of them survive.
      await expect(
        erasing(
          participantId,
          `DELETE FROM experiment_exposures WHERE assignment_id = $1`,
          [assignmentId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('refuses an unmarked delete, so an arm cannot be re-rolled', async () => {
      const id = await newExposure(
        experimentOf[TEAM_A] as string,
        assignmentOf[TEAM_A] as string,
      );

      // Deleting the exposures is the first half of re-rolling an assignment:
      // the composite key only holds the assignment while they exist.
      await expect(
        pool.query(`DELETE FROM experiment_exposures WHERE id = $1`, [id]),
      ).rejects.toThrow(
        'experiment exposures are deleted only by an audited erasure or the maintenance purge',
      );
    });

    it('lets the maintenance purge delete without a marker', async () => {
      const id = await newExposure(
        experimentOf[TEAM_A] as string,
        assignmentOf[TEAM_A] as string,
      );

      await expect(
        maintenance.query(`DELETE FROM experiment_exposures WHERE id = $1`, [
          id,
        ]),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("proves the marker against the exposure's own assignment", async () => {
      const participantId = randomUUID();
      const assignmentId = await newParticipantAssignment(participantId);
      const theirs = await newParticipantAssignment(randomUUID());
      const id = await newExposure(experimentOf[TEAM_A] as string, theirs);

      await expect(
        erasing(
          participantId,
          `DELETE FROM experiment_exposures WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(
        'experiment exposures are deleted only by an audited erasure or the maintenance purge',
      );
      // ...and the same marker reaches its own participant's exposures.
      await newExposure(experimentOf[TEAM_A] as string, assignmentId);
      await expect(
        erasing(
          participantId,
          `DELETE FROM experiment_exposures WHERE assignment_id = $1`,
          [assignmentId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
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
