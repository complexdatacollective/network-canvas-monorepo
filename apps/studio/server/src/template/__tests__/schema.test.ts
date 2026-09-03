// The template tables' database-enforced promises: the gallery metadata row's
// vetted licence and kind sets, a published version's immutability, and the pin
// set that makes a template's content garbage-collection-safe by construction —
// including the insert-frozen rule that stops a pin appearing after the version
// that names it was frozen.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK, unique or foreign-key violation, the message for a trigger
// — so a guard that stopped firing cannot pass as "no error".
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

describe.skipIf(!db)('template schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  /** One committed section document per team, for the pin set's foreign key. */
  const sectionOf: Record<string, string> = {};

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers or constraints.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const templateRow = (overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    kind: 'protocol',
    name: 'A template',
    ...overrides,
  });

  const versionRow = (templateId: string, overrides: Row = {}): Row => ({
    id: randomUUID(),
    team_id: TEAM_A,
    template_id: templateId,
    version_number: 1,
    manifest: JSON.stringify({ intro: hex64() }),
    manifest_hash: hex64(),
    schema_version: 8,
    ...overrides,
  });

  const pinRow = (versionId: string, overrides: Row = {}): Row => ({
    version_id: versionId,
    team_id: TEAM_A,
    section_id: 'intro',
    section_hash: sectionOf[TEAM_A],
    ...overrides,
  });

  async function newTemplate(overrides: Row = {}): Promise<string> {
    const row = templateRow(overrides);
    await insert('templates', row);
    return row.id as string;
  }

  async function newVersion(
    templateId: string,
    overrides: Row = {},
  ): Promise<string> {
    const row = versionRow(templateId, overrides);
    await insert('template_versions', row);
    return row.id as string;
  }

  /**
   * Publication as the command layer performs it: the version row and every
   * pin it names in one transaction, which is the only window the
   * insert-frozen trigger admits.
   */
  async function publish(
    templateId: string,
    pins: readonly Row[],
    overrides: Row = {},
  ): Promise<string> {
    const version = versionRow(templateId, overrides);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const columns = Object.keys(version);
      await client.query(
        `INSERT INTO template_versions (${columns.map((n) => `"${n}"`).join(', ')})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        Object.values(version),
      );
      for (const pin of pins) {
        const pinColumns = Object.keys(pin);
        await client.query(
          `INSERT INTO template_version_sections (${pinColumns.map((n) => `"${n}"`).join(', ')})
           VALUES (${pinColumns.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(pin),
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return version.id as string;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) {
      await seedTeam(pool, teamId);
      const hash = hex64();
      sectionOf[teamId] = hash;
      await insert('sections', {
        team_id: teamId,
        hash,
        doc: JSON.stringify({ kind: 'intro' }),
      });
    }
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('templates', () => {
    it('applies the documented defaults', async () => {
      const id = await newTemplate();

      const row = await pool.query<Row>(
        `SELECT license, curated, state, metadata, summary, author_user_id
         FROM templates WHERE id = $1`,
        [id],
      );
      // The badge is review-granted, so a template never arrives curated.
      expect(row.rows[0]).toEqual({
        license: 'CC-BY-4.0',
        curated: false,
        state: 'draft',
        metadata: {},
        summary: null,
        author_user_id: null,
      });
    });

    it.each([
      ['an unknown kind', { kind: 'interview' }, 'templates_kind_check'],
      [
        'a licence outside the vetted set',
        { license: 'MIT' },
        'templates_license_check',
      ],
      [
        'a bare copyright reservation',
        { license: 'all-rights-reserved' },
        'templates_license_check',
      ],
      ['an unknown state', { state: 'archived' }, 'templates_state_check'],
      [
        'scalar metadata',
        { metadata: JSON.stringify('cite me') },
        'templates_metadata_object_check',
      ],
      ['a blank name', { name: '   ' }, 'templates_lengths_check'],
      [
        'a name past 200 characters',
        { name: 'x'.repeat(201) },
        'templates_lengths_check',
      ],
      ['an empty summary', { summary: '' }, 'templates_lengths_check'],
      [
        'a summary past 2000 characters',
        { summary: 's'.repeat(2001) },
        'templates_lengths_check',
      ],
      ['a blank author id', { author_user_id: '' }, 'templates_lengths_check'],
      [
        'an author id past 255 characters',
        { author_user_id: 'u'.repeat(256) },
        'templates_lengths_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(
        insert('templates', templateRow(overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it.each(['CC-BY-4.0', 'CC0-1.0'])(
      'admits the %s licence',
      async (license) => {
        await expect(
          insert('templates', templateRow({ license })),
        ).resolves.toMatchObject({ rowCount: 1 });
      },
    );

    it.each([
      'protocol',
      'stage',
      'entity_definition',
      'variable_set',
      'generator_prompt_set',
    ])('admits the %s kind', async (kind) => {
      await expect(
        insert('templates', templateRow({ kind })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('shows a team only its own templates', async () => {
      const mine = await newTemplate();
      const theirs = await newTemplate({ team_id: TEAM_B });

      const visible = await tenantA.query(
        `SELECT id FROM templates WHERE id = ANY($1::uuid[])`,
        [[mine, theirs]],
      );
      expect(visible.rows).toEqual([{ id: mine }]);
    });
  });

  describe('template_versions', () => {
    it.each([
      [
        'a zero version number',
        { version_number: 0 },
        'template_versions_numbers_check',
      ],
      [
        'a zero schema version',
        { schema_version: 0 },
        'template_versions_numbers_check',
      ],
      [
        'a malformed manifest hash',
        { manifest_hash: 'not-a-digest' },
        'template_versions_manifest_hash_check',
      ],
      [
        'an uppercase manifest hash',
        { manifest_hash: hex64().toUpperCase() },
        'template_versions_manifest_hash_check',
      ],
      [
        'a scalar manifest',
        { manifest: JSON.stringify(3) },
        'template_versions_manifest_object_check',
      ],
    ])('rejects %s', async (_label, overrides, constraint) => {
      const templateId = await newTemplate();
      await expect(
        insert('template_versions', versionRow(templateId, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('numbers versions once per template and publishes content once', async () => {
      const templateId = await newTemplate();
      const first = versionRow(templateId);
      await insert('template_versions', first);

      await expect(
        insert('template_versions', versionRow(templateId)),
      ).rejects.toMatchObject({ code: '23505' });
      // Re-publishing identical content under a new number is refused too:
      // the manifest hash identifies what the version resolves to.
      await expect(
        insert(
          'template_versions',
          versionRow(templateId, {
            version_number: 2,
            manifest_hash: first.manifest_hash,
          }),
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        insert(
          'template_versions',
          versionRow(templateId, { version_number: 2 }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("refuses a version under another team's template", async () => {
      const theirs = await newTemplate({ team_id: TEAM_B });

      await expect(
        insert('template_versions', versionRow(theirs, { team_id: TEAM_A })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'template_versions_template_fk',
      });
    });

    it.each([
      ['the manifest', `manifest = '{"intro":"other"}'::jsonb`],
      ['the manifest hash', `manifest_hash = '${'a'.repeat(64)}'`],
      ['the version number', 'version_number = 2'],
      ['the schema version', 'schema_version = 9'],
      ['the publication stamp', 'published_at = now()'],
    ])(
      'refuses to rewrite %s of a published version',
      async (_l, assignment) => {
        const versionId = await newVersion(await newTemplate());

        await expect(
          pool.query(
            `UPDATE template_versions SET ${assignment} WHERE id = $1`,
            [versionId],
          ),
        ).rejects.toThrow('published template versions are immutable');
      },
    );

    it('refuses to retract a published version', async () => {
      const versionId = await newVersion(await newTemplate());

      await expect(
        pool.query(`DELETE FROM template_versions WHERE id = $1`, [versionId]),
      ).rejects.toThrow('published template versions are immutable');
    });
  });

  describe('template_version_sections', () => {
    it('admits a pin written in the version its own transaction created', async () => {
      const templateId = await newTemplate();
      const versionId = randomUUID();
      const published = await publish(
        templateId,
        [pinRow(versionId), pinRow(versionId, { section_id: 'outro' })],
        { id: versionId },
      );

      const pins = await pool.query<{ section_id: string }>(
        `SELECT section_id FROM template_version_sections
         WHERE version_id = $1 ORDER BY section_id`,
        [published],
      );
      expect(pins.rows).toEqual([
        { section_id: 'intro' },
        { section_id: 'outro' },
      ]);
    });

    it('refuses a pin added after the version was frozen', async () => {
      const versionId = await newVersion(await newTemplate());

      await expect(
        insert('template_version_sections', pinRow(versionId)),
      ).rejects.toThrow('published template versions are immutable');
    });

    it('refuses a pin naming no version at all', async () => {
      await expect(
        insert('template_version_sections', pinRow(randomUUID())),
      ).rejects.toThrow('published template versions are immutable');
    });

    it('refuses a pin on a section the team does not hold', async () => {
      const templateId = await newTemplate();
      const versionId = randomUUID();

      await expect(
        publish(templateId, [pinRow(versionId, { section_hash: hex64() })], {
          id: versionId,
        }),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'template_version_sections_section_fk',
      });
    });

    it("refuses a pin on another team's section", async () => {
      const templateId = await newTemplate();
      const versionId = randomUUID();

      // Referential integrity bypasses row-level security, so the composite
      // key is what keeps a template's content inside its own tenant.
      await expect(
        publish(
          templateId,
          [pinRow(versionId, { section_hash: sectionOf[TEAM_B] })],
          { id: versionId },
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'template_version_sections_section_fk',
      });
    });

    it('makes a pinned section structurally unsweepable', async () => {
      const templateId = await newTemplate();
      const versionId = randomUUID();
      await publish(templateId, [pinRow(versionId)], { id: versionId });

      await expect(
        pool.query(`DELETE FROM sections WHERE team_id = $1 AND hash = $2`, [
          TEAM_A,
          sectionOf[TEAM_A],
        ]),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('freezes an existing pin against rewriting and retraction', async () => {
      const templateId = await newTemplate();
      const versionId = randomUUID();
      await publish(templateId, [pinRow(versionId)], { id: versionId });

      await expect(
        pool.query(
          `UPDATE template_version_sections SET section_id = 'renamed'
           WHERE version_id = $1`,
          [versionId],
        ),
      ).rejects.toThrow('published template versions are immutable');
      await expect(
        pool.query(
          `DELETE FROM template_version_sections WHERE version_id = $1`,
          [versionId],
        ),
      ).rejects.toThrow('published template versions are immutable');
    });
  });
});
