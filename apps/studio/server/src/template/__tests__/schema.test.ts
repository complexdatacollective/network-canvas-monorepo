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

import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import {
  insertTeam,
  ownerAffected,
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  testDb,
  ownerInsert,
} from '../../__tests__/support/database.ts';
import {
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

type CheckCase = readonly [label: string, overrides: Row, constraint: string];

const hex64 = () => randomBytes(32).toString('hex');

/** One committed section document per team, for the pin set's foreign key. */
const sectionOf: Record<string, string> = {
  [TEAM_A]: hex64(),
  [TEAM_B]: hex64(),
};

const insertStatement = (table: string, row: Row) => {
  const columns = Object.keys(row);
  return [
    `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row),
  ] as const;
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

const newTemplate = Effect.fnUntraced(function* (overrides: Row = {}) {
  const row = templateRow(overrides);
  yield* ownerInsert('templates', row);
  return row.id as string;
});

const newVersion = Effect.fnUntraced(function* (
  templateId: string,
  overrides: Row = {},
) {
  const row = versionRow(templateId, overrides);
  yield* ownerInsert('template_versions', row);
  return row.id as string;
});

/**
 * Publication as the command layer performs it: the version row and every
 * pin it names in one transaction, which is the only window the
 * insert-frozen trigger admits.
 */
const publish = Effect.fnUntraced(function* (
  templateId: string,
  pins: readonly Row[],
  overrides: Row = {},
) {
  const harness = yield* TestDatabase;
  const { sql } = harness.owner;
  const version = versionRow(templateId, overrides);
  yield* harness.onOwner(
    Effect.gen(function* () {
      yield* sql.unsafe(...insertStatement('template_versions', version));
      for (const pin of pins) {
        yield* sql.unsafe(...insertStatement('template_version_sections', pin));
      }
    }),
  );
  return version.id as string;
});

/** Both teams, each holding one committed section. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) =>
    Effect.andThen(
      insertTeam(teamId),
      ownerInsert('sections', {
        team_id: teamId,
        hash: sectionOf[teamId],
        doc: JSON.stringify({ kind: 'intro' }),
      }),
    ),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('template schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('templates', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const id = yield* newTemplate();

          const rows = yield* ownerRows(
            `SELECT license, curated, state, metadata, summary, author_user_id
             FROM templates WHERE id = $1`,
            [id],
          );
          // The badge is review-granted, so a template never arrives curated.
          expect(rows[0]).toEqual({
            license: 'CC-BY-4.0',
            curated: false,
            state: 'draft',
            metadata: {},
            summary: null,
            author_user_id: null,
          });
        }),
      );

      it.effect.each<CheckCase>([
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
        [
          'a blank author id',
          { author_user_id: '' },
          'templates_lengths_check',
        ],
        [
          'an author id past 255 characters',
          { author_user_id: 'u'.repeat(256) },
          'templates_lengths_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('templates', templateRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect.each(['CC-BY-4.0', 'CC0-1.0'])(
        'admits the %s licence',
        (license) =>
          Effect.gen(function* () {
            expect(
              yield* ownerInsert('templates', templateRow({ license })),
            ).toBe(1);
          }),
      );

      it.effect.each([
        'protocol',
        'stage',
        'entity_definition',
        'variable_set',
        'generator_prompt_set',
      ])('admits the %s kind', (kind) =>
        Effect.gen(function* () {
          expect(yield* ownerInsert('templates', templateRow({ kind }))).toBe(
            1,
          );
        }),
      );

      it.effect('shows a team only its own templates', () =>
        Effect.gen(function* () {
          const mine = yield* newTemplate();
          const theirs = yield* newTemplate({ team_id: TEAM_B });

          const visible = yield* TenantScope.open(
            unsafeMakeTeamAccess(TEAM_A, 'owner'),
            Effect.flatMap(Transaction, ({ sql }) =>
              sql.unsafe<Row>(
                `SELECT id FROM templates WHERE id = ANY($1::uuid[])`,
                [[mine, theirs]],
              ),
            ),
          );
          expect(visible).toEqual([{ id: mine }]);
        }),
      );
    });

    describe('template_versions', () => {
      it.effect.each<CheckCase>([
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
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          const refused = yield* refusalOf(
            ownerInsert('template_versions', versionRow(templateId, overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect(
        'numbers versions once per template and publishes content once',
        () =>
          Effect.gen(function* () {
            const templateId = yield* newTemplate();
            const first = versionRow(templateId);
            yield* ownerInsert('template_versions', first);

            const renumbered = yield* refusalOf(
              ownerInsert('template_versions', versionRow(templateId)),
            );
            expect(renumbered.state).toBe('23505');
            // Re-publishing identical content under a new number is refused
            // too: the manifest hash identifies what the version resolves to.
            const republished = yield* refusalOf(
              ownerInsert(
                'template_versions',
                versionRow(templateId, {
                  version_number: 2,
                  manifest_hash: first.manifest_hash,
                }),
              ),
            );
            expect(republished.state).toBe('23505');
            expect(
              yield* ownerInsert(
                'template_versions',
                versionRow(templateId, { version_number: 2 }),
              ),
            ).toBe(1);
          }),
      );

      it.effect("refuses a version under another team's template", () =>
        Effect.gen(function* () {
          const theirs = yield* newTemplate({ team_id: TEAM_B });

          const refused = yield* refusalOf(
            ownerInsert(
              'template_versions',
              versionRow(theirs, { team_id: TEAM_A }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'template_versions_template_fk',
          });
        }),
      );

      it.effect.each<readonly [label: string, assignment: string]>([
        ['the manifest', `manifest = '{"intro":"other"}'::jsonb`],
        ['the manifest hash', `manifest_hash = '${'a'.repeat(64)}'`],
        ['the version number', 'version_number = 2'],
        ['the schema version', 'schema_version = 9'],
        ['the publication stamp', 'published_at = now()'],
      ])('refuses to rewrite %s of a published version', ([_l, assignment]) =>
        Effect.gen(function* () {
          const versionId = yield* newVersion(yield* newTemplate());

          const refused = yield* refusalOf(
            ownerAffected(
              `UPDATE template_versions SET ${assignment} WHERE id = $1`,
              [versionId],
            ),
          );
          expect(refused.message).toContain(
            'published template versions are immutable',
          );
        }),
      );

      it.effect('refuses to retract a published version', () =>
        Effect.gen(function* () {
          const versionId = yield* newVersion(yield* newTemplate());

          const refused = yield* refusalOf(
            ownerAffected(`DELETE FROM template_versions WHERE id = $1`, [
              versionId,
            ]),
          );
          expect(refused.message).toContain(
            'published template versions are immutable',
          );
        }),
      );
    });

    describe('template_version_sections', () => {
      it.effect(
        'admits a pin written in the version its own transaction created',
        () =>
          Effect.gen(function* () {
            const templateId = yield* newTemplate();
            const versionId = randomUUID();
            const published = yield* publish(
              templateId,
              [pinRow(versionId), pinRow(versionId, { section_id: 'outro' })],
              { id: versionId },
            );

            const pins = yield* ownerRows<{ section_id: string }>(
              `SELECT section_id FROM template_version_sections
               WHERE version_id = $1 ORDER BY section_id`,
              [published],
            );
            expect(pins).toEqual([
              { section_id: 'intro' },
              { section_id: 'outro' },
            ]);
          }),
      );

      it.effect('refuses a pin added after the version was frozen', () =>
        Effect.gen(function* () {
          const versionId = yield* newVersion(yield* newTemplate());

          const refused = yield* refusalOf(
            ownerInsert('template_version_sections', pinRow(versionId)),
          );
          expect(refused.message).toContain(
            'published template versions are immutable',
          );
        }),
      );

      it.effect('refuses a pin naming no version at all', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('template_version_sections', pinRow(randomUUID())),
          );
          expect(refused.message).toContain(
            'published template versions are immutable',
          );
        }),
      );

      it.effect('refuses a pin on a section the team does not hold', () =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          const versionId = randomUUID();

          const refused = yield* refusalOf(
            publish(
              templateId,
              [pinRow(versionId, { section_hash: hex64() })],
              { id: versionId },
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'template_version_sections_section_fk',
          });
        }),
      );

      it.effect("refuses a pin on another team's section", () =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          const versionId = randomUUID();

          // Referential integrity bypasses row-level security, so the
          // composite key is what keeps a template's content inside its own
          // tenant.
          const refused = yield* refusalOf(
            publish(
              templateId,
              [pinRow(versionId, { section_hash: sectionOf[TEAM_B] })],
              { id: versionId },
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'template_version_sections_section_fk',
          });
        }),
      );

      it.effect('makes a pinned section structurally unsweepable', () =>
        Effect.gen(function* () {
          const templateId = yield* newTemplate();
          const versionId = randomUUID();
          yield* publish(templateId, [pinRow(versionId)], { id: versionId });

          const refused = yield* refusalOf(
            ownerAffected(
              `DELETE FROM sections WHERE team_id = $1 AND hash = $2`,
              [TEAM_A, sectionOf[TEAM_A]],
            ),
          );
          expect(refused.state).toBe('23503');
        }),
      );

      it.effect(
        'freezes an existing pin against rewriting and retraction',
        () =>
          Effect.gen(function* () {
            const templateId = yield* newTemplate();
            const versionId = randomUUID();
            yield* publish(templateId, [pinRow(versionId)], { id: versionId });

            const rewritten = yield* refusalOf(
              ownerAffected(
                `UPDATE template_version_sections SET section_id = 'renamed'
               WHERE version_id = $1`,
                [versionId],
              ),
            );
            expect(rewritten.message).toContain(
              'published template versions are immutable',
            );
            const retracted = yield* refusalOf(
              ownerAffected(
                `DELETE FROM template_version_sections WHERE version_id = $1`,
                [versionId],
              ),
            );
            expect(retracted.message).toContain(
              'published template versions are immutable',
            );
          }),
      );
    });
  });
});
