// The asset metadata tables' database-enforced promises: the defaults, every
// CHECK, the composite foreign key that keeps a pin inside its own tenant, the
// three sidecar triggers that freeze asset metadata, freeze a published pin,
// and hold a published referrer's pin set to the transaction that published
// it, and the unreferenced marker the garbage collector moves.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK or foreign-key violation, the message for a trigger — so a
// guard that stopped firing cannot pass as "no error".
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
  maintenanceAffected,
  ownerInsert,
  tenantRows,
} from '../../__tests__/support/database.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Row = Record<string, unknown>;

const hex64 = () => randomBytes(32).toString('hex');

/** The three referrer kinds `asset_references_published_immutable` freezes. */
const PUBLISHED_KINDS = [
  'protocol_version',
  'template_version',
  'consent_document',
] as const;

/** The two of them that are published by the insert that creates them. */
const VERSION_KINDS = ['protocol_version', 'template_version'] as const;

const insertSql = (table: string, row: Row): [string, unknown[]] => [
  `INSERT INTO ${table} (${Object.keys(row)
    .map((name) => `"${name}"`)
    .join(', ')})
   VALUES (${Object.keys(row)
     .map((_, i) => `$${i + 1}`)
     .join(', ')})`,
  Object.values(row),
];

/** One statement as the connecting login, inside the transaction already open. */
const inOwnerTransaction = (
  text: string,
  params: ReadonlyArray<unknown> = [],
) =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.owner.sql.unsafe<Row>(text, params),
  );

/**
 * One transaction as the connecting login. The insert guard admits a pin on a
 * published referrer only inside the transaction that published it, so a case
 * that needs such a pin has to write both together — and a case that needs
 * the window closed publishes the referrer here and pins afterwards.
 */
const inTransaction = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  Effect.flatMap(TestDatabase, (harness) => harness.onOwner(body));

/**
 * A referrer of `kind`, with whatever parent row it needs, and its id.
 * A protocol version and a template version are published by the insert
 * that creates them; a consent document is published only when `published`.
 */
const createReferrer = Effect.fnUntraced(function* (
  kind: string,
  { published = true }: { published?: boolean } = {},
) {
  const id = randomUUID();
  if (kind === 'protocol_version') {
    const protocolId = randomUUID();
    yield* inOwnerTransaction(
      ...insertSql('protocols', {
        id: protocolId,
        team_id: TEAM_A,
        name: 'Pinned protocol',
      }),
    );
    yield* inOwnerTransaction(
      ...insertSql('protocol_versions', {
        id,
        protocol_id: protocolId,
        team_id: TEAM_A,
        version_number: 1,
        version_hash: hex64(),
        manifest: JSON.stringify({}),
        schema_version: 8,
        source_manifest_hash: hex64(),
      }),
    );
    return id;
  }
  if (kind === 'template_version') {
    const templateId = randomUUID();
    yield* inOwnerTransaction(
      ...insertSql('templates', {
        id: templateId,
        team_id: TEAM_A,
        kind: 'protocol',
        name: 'Pinned template',
      }),
    );
    yield* inOwnerTransaction(
      ...insertSql('template_versions', {
        id,
        team_id: TEAM_A,
        template_id: templateId,
        version_number: 1,
        manifest: JSON.stringify({}),
        manifest_hash: hex64(),
        schema_version: 8,
      }),
    );
    return id;
  }
  const studyId = randomUUID();
  yield* inOwnerTransaction(
    ...insertSql('studies', {
      id: studyId,
      team_id: TEAM_A,
      name: 'Consenting study',
    }),
  );
  yield* inOwnerTransaction(
    ...insertSql('consent_documents', {
      id,
      team_id: TEAM_A,
      study_id: studyId,
      version: 1,
      state: published ? 'published' : 'draft',
      published_at: published ? new Date() : null,
      title: 'Information sheet',
      body: JSON.stringify({}),
      content_hash: hex64(),
    }),
  );
  return id;
});

const assetRow = (overrides: Row = {}): Row => ({
  team_id: TEAM_A,
  hash: hex64(),
  media_type: 'image/png',
  media_class: 'image',
  byte_size: 1024,
  original_filename: 'photo.png',
  origin: 'upload',
  ...overrides,
});

const referenceRow = (assetHash: string, overrides: Row = {}): Row => ({
  team_id: TEAM_A,
  asset_hash: assetHash,
  referrer_kind: 'section',
  referrer_id: hex64(),
  ...overrides,
});

const newAsset = (overrides: Row = {}) => {
  const row = assetRow(overrides);
  return Effect.as(ownerInsert('assets', row), row.hash as string);
};

const newReference = (assetHash: string, overrides: Row = {}) => {
  const row = referenceRow(assetHash, overrides);
  return Effect.as(ownerInsert('asset_references', row), row);
};

/**
 * Publishes a referrer of `kind` and pins `assetHash` to it, together, the
 * way each kind is published: a version by the insert that creates it, a
 * consent document drafted, pinned, and then moved to `published`.
 */
const pinAtPublication = (kind: string, assetHash: string) =>
  inTransaction(
    Effect.gen(function* () {
      const drafted = kind === 'consent_document';
      const referrerId = yield* createReferrer(kind, {
        published: !drafted,
      });
      yield* inOwnerTransaction(
        ...insertSql(
          'asset_references',
          referenceRow(assetHash, {
            referrer_kind: kind,
            referrer_id: referrerId,
          }),
        ),
      );
      if (drafted) {
        yield* inOwnerTransaction(
          `UPDATE consent_documents SET state = 'published', published_at = now()
           WHERE id = $1`,
          [referrerId],
        );
      }
      return referrerId;
    }),
  );

/** Both teams, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach([TEAM_A, TEAM_B], (teamId) => insertTeam(teamId)),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('asset schema', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    describe('assets', () => {
      it.effect('applies the documented defaults', () =>
        Effect.gen(function* () {
          const hash = yield* newAsset();

          const rows = yield* ownerRows(
            `SELECT uploaded_by_user_id, dataset_metadata, unreferenced_at,
                    created_at IS NOT NULL AS stamped,
                    created_at <= clock_timestamp() AS wall_clock
             FROM assets WHERE team_id = $1 AND hash = $2`,
            [TEAM_A, hash],
          );
          expect(rows[0]).toEqual({
            uploaded_by_user_id: null,
            dataset_metadata: null,
            unreferenced_at: null,
            stamped: true,
            wall_clock: true,
          });
        }),
      );

      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'a non-hex digest',
          { hash: `zz${'0'.repeat(62)}` },
          'assets_hash_check',
        ],
        [
          'an uppercase digest',
          { hash: hex64().toUpperCase() },
          'assets_hash_check',
        ],
        ['a short digest', { hash: '0'.repeat(63) }, 'assets_hash_check'],
        [
          'a media type with no subtype',
          { media_type: 'image' },
          'assets_media_type_check',
        ],
        [
          'an uppercase media type',
          { media_type: 'Image/PNG' },
          'assets_media_type_check',
        ],
        [
          'an unknown media class',
          { media_class: 'archive' },
          'assets_media_class_check',
        ],
        ['a zero-byte object', { byte_size: 0 }, 'assets_byte_size_check'],
        [
          'an object past two gibibytes',
          { byte_size: 2_147_483_649 },
          'assets_byte_size_check',
        ],
        [
          'a blank filename',
          { original_filename: '   ' },
          'assets_original_filename_check',
        ],
        [
          'a filename past 255 characters',
          { original_filename: `${'x'.repeat(252)}.png` },
          'assets_original_filename_check',
        ],
        [
          'a filename carrying a path separator',
          { original_filename: 'nested/photo.png' },
          'assets_original_filename_check',
        ],
        [
          'a filename carrying a Windows separator',
          { original_filename: 'nested\\photo.png' },
          'assets_original_filename_check',
        ],
        ['an unknown origin', { origin: 'sideload' }, 'assets_origin_check'],
        [
          'dataset metadata on a non-dataset asset',
          { dataset_metadata: JSON.stringify({ columns: ['a'] }) },
          'assets_dataset_metadata_check',
        ],
        [
          'scalar dataset metadata',
          {
            media_class: 'dataset',
            media_type: 'text/csv',
            dataset_metadata: JSON.stringify(3),
          },
          'assets_dataset_metadata_check',
        ],
        [
          'a blank uploader id',
          { uploaded_by_user_id: '' },
          'assets_uploaded_by_user_id_check',
        ],
        [
          'an uploader id past 255 characters',
          { uploaded_by_user_id: 'u'.repeat(256) },
          'assets_uploaded_by_user_id_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('assets', assetRow(overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('accepts the shapes the checks exist to admit', () =>
        Effect.gen(function* () {
          expect(
            yield* ownerInsert(
              'assets',
              assetRow({
                media_class: 'dataset',
                media_type: 'text/csv',
                dataset_metadata: JSON.stringify({ columns: ['a'], rows: 12 }),
                uploaded_by_user_id: 'user-1',
                origin: 'registry_import',
                byte_size: 2_147_483_648,
              }),
            ),
          ).toBe(1);
        }),
      );

      it.effect(
        'deduplicates per team rather than across the tenant boundary',
        () =>
          Effect.gen(function* () {
            const hash = yield* newAsset();

            const refused = yield* refusalOf(
              ownerInsert('assets', assetRow({ hash })),
            );
            expect(refused.state).toBe('23505');
            // The same bytes in another team are a different row, by design.
            expect(
              yield* ownerInsert('assets', assetRow({ hash, team_id: TEAM_B })),
            ).toBe(1);
          }),
      );
    });

    describe('asset_references', () => {
      it.effect.each<
        readonly [label: string, overrides: Row, constraint: string]
      >([
        [
          'an unknown referrer kind',
          { referrer_kind: 'draft' },
          'asset_references_referrer_kind_check',
        ],
        [
          'a blank referrer id',
          { referrer_id: '' },
          'asset_references_referrer_id_check',
        ],
        [
          'a referrer id past 255 characters',
          { referrer_id: 'r'.repeat(256) },
          'asset_references_referrer_id_check',
        ],
      ])('rejects %s', ([_label, overrides, constraint]) =>
        Effect.gen(function* () {
          const hash = yield* newAsset();
          const refused = yield* refusalOf(
            ownerInsert('asset_references', referenceRow(hash, overrides)),
          );
          expect(refused.constraint).toBe(constraint);
        }),
      );

      it.effect('refuses a pin on an asset that does not exist', () =>
        Effect.gen(function* () {
          const refused = yield* refusalOf(
            ownerInsert('asset_references', referenceRow(hex64())),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'asset_references_asset_fk',
          });
        }),
      );

      it.effect("refuses a pin on another team's asset", () =>
        Effect.gen(function* () {
          const hash = yield* newAsset({ team_id: TEAM_B });

          // Referential integrity bypasses row-level security, so the composite
          // key is what stops one team citing another team's content hash.
          const refused = yield* refusalOf(
            ownerInsert(
              'asset_references',
              referenceRow(hash, { team_id: TEAM_A }),
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'asset_references_asset_fk',
          });
          expect(
            yield* ownerInsert(
              'asset_references',
              referenceRow(hash, { team_id: TEAM_B }),
            ),
          ).toBe(1);
        }),
      );

      it.effect('pins the same asset once per referrer', () =>
        Effect.gen(function* () {
          const hash = yield* newAsset();
          const pin = yield* newReference(hash, { referrer_id: 'section-1' });

          const refused = yield* refusalOf(
            ownerInsert('asset_references', pin),
          );
          expect(refused.state).toBe('23505');
          // A second referrer, and a second kind, are separate pins.
          expect(
            yield* ownerInsert(
              'asset_references',
              referenceRow(hash, { referrer_id: 'section-2' }),
            ),
          ).toBe(1);
          expect(
            yield* ownerInsert(
              'asset_references',
              referenceRow(hash, {
                referrer_kind: 'message_template',
                referrer_id: 'section-1',
              }),
            ),
          ).toBe(1);
        }),
      );
    });

    describe('assets_metadata_immutable', () => {
      it.effect.each<readonly [label: string, assignment: string]>([
        ['the media type', `media_type = 'image/jpeg'`],
        ['the media class', `media_class = 'document'`],
        ['the byte size', 'byte_size = 2048'],
        ['the original filename', `original_filename = 'other.png'`],
        ['the origin', `origin = 'seed'`],
        ['the uploader', `uploaded_by_user_id = 'user-2'`],
        ['the dataset metadata', `dataset_metadata = '{}'::jsonb`],
        ['the content hash', `hash = '${'a'.repeat(64)}'`],
        ['the owning team', `team_id = '${TEAM_B}'`],
        ['the creation stamp', 'created_at = now()'],
      ])('refuses to rewrite %s', ([_label, assignment]) =>
        Effect.gen(function* () {
          const hash = yield* newAsset();

          const refused = yield* refusalOf(
            ownerAffected(
              `UPDATE assets SET ${assignment} WHERE team_id = $1 AND hash = $2`,
              [TEAM_A, hash],
            ),
          );
          expect(refused.message).toContain('asset metadata is immutable');
        }),
      );

      it.effect('lets the sweep marker move in both directions', () =>
        Effect.gen(function* () {
          const hash = yield* newAsset();

          const marked = yield* ownerAffected(
            `UPDATE assets SET unreferenced_at = clock_timestamp()
             WHERE team_id = $1 AND hash = $2`,
            [TEAM_A, hash],
          );
          expect(marked).toBe(1);
          const swept = yield* ownerRows(
            `SELECT unreferenced_at IS NOT NULL AS marked FROM assets
             WHERE team_id = $1 AND hash = $2`,
            [TEAM_A, hash],
          );
          expect(swept[0]).toEqual({ marked: true });

          // Reconciliation clears the marker when a pin reappears.
          const reconciled = yield* ownerAffected(
            `UPDATE assets SET unreferenced_at = NULL
             WHERE team_id = $1 AND hash = $2`,
            [TEAM_A, hash],
          );
          expect(reconciled).toBe(1);
          const cleared = yield* ownerRows(
            `SELECT unreferenced_at IS NOT NULL AS marked FROM assets
             WHERE team_id = $1 AND hash = $2`,
            [TEAM_A, hash],
          );
          expect(cleared[0]).toEqual({ marked: false });
        }),
      );
    });

    describe('asset_references_published_immutable', () => {
      it.effect.each(PUBLISHED_KINDS)(
        'freezes a %s pin against update and retraction',
        (referrerKind) =>
          Effect.gen(function* () {
            const hash = yield* newAsset();
            const referrerId = yield* pinAtPublication(referrerKind, hash);

            const updated = yield* refusalOf(
              ownerAffected(
                `UPDATE asset_references SET created_at = now()
                 WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
                   AND referrer_id = $4`,
                [TEAM_A, hash, referrerKind, referrerId],
              ),
            );
            expect(updated.message).toContain(
              'published asset references are immutable',
            );
            const deleted = yield* refusalOf(
              ownerAffected(
                `DELETE FROM asset_references
                 WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
                   AND referrer_id = $4`,
                [TEAM_A, hash, referrerKind, referrerId],
              ),
            );
            expect(deleted.message).toContain(
              'published asset references are immutable',
            );
          }),
      );

      it.effect(
        'lets a draft consent document retract a pin, and freezes it at publication',
        () =>
          Effect.gen(function* () {
            // The same boundary the insert guard draws: while the document is
            // a draft an author may replace or remove an attached asset;
            // publication fixes the set in both directions.
            const hash = yield* newAsset();
            const documentId = yield* inTransaction(
              createReferrer('consent_document', { published: false }),
            );
            yield* newReference(hash, {
              referrer_kind: 'consent_document',
              referrer_id: documentId,
            });
            const retracted = yield* ownerAffected(
              `DELETE FROM asset_references
               WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = 'consent_document'
                 AND referrer_id = $3`,
              [TEAM_A, hash, documentId],
            );
            expect(retracted).toBe(1);

            yield* newReference(hash, {
              referrer_kind: 'consent_document',
              referrer_id: documentId,
            });
            // Retracted, never re-pointed: an UPDATE aiming the draft's pin at
            // a published version would be a late pin on that version that the
            // insert guard never saw.
            const versionId = yield* inTransaction(
              createReferrer('protocol_version'),
            );
            const repointed = yield* refusalOf(
              ownerAffected(
                `UPDATE asset_references
                 SET referrer_kind = 'protocol_version', referrer_id = $4
                 WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = 'consent_document'
                   AND referrer_id = $3`,
                [TEAM_A, hash, documentId, versionId],
              ),
            );
            expect(repointed.message).toContain(
              'published asset references are immutable',
            );
            yield* ownerAffected(
              `UPDATE consent_documents SET state = 'published', published_at = now()
               WHERE id = $1`,
              [documentId],
            );
            const deleted = yield* refusalOf(
              ownerAffected(
                `DELETE FROM asset_references
                 WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = 'consent_document'
                   AND referrer_id = $3`,
                [TEAM_A, hash, documentId],
              ),
            );
            expect(deleted.message).toContain(
              'published asset references are immutable',
            );
          }),
      );

      it.effect.each(PUBLISHED_KINDS)(
        'lets the maintenance purge delete a %s pin, and nobody else',
        (referrerKind) =>
          Effect.gen(function* () {
            // A study is purged bottom-up, and asset_references carries no key
            // onto its heterogeneous referrer: a published document's pins
            // would otherwise outlive the document, never satisfying the draft
            // test again, and hold the asset's metadata and bytes against
            // garbage collection for good.
            const hash = yield* newAsset();
            const referrerId = yield* pinAtPublication(referrerKind, hash);
            const where = `WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
                 AND referrer_id = $4`;
            const params = [TEAM_A, hash, referrerKind, referrerId];

            const updated = yield* refusalOf(
              maintenanceAffected(
                `UPDATE asset_references SET created_at = now() ${where}`,
                params,
              ),
            );
            expect(updated.message).toContain(
              'published asset references are immutable',
            );
            expect(
              yield* maintenanceAffected(
                `DELETE FROM asset_references ${where}`,
                params,
              ),
            ).toBe(1);
          }),
      );

      it.effect.each(['section', 'message_template'])(
        'lets a %s pin be retracted, because its referrer is still editable',
        (referrerKind) =>
          Effect.gen(function* () {
            const hash = yield* newAsset();
            const pin = yield* newReference(hash, {
              referrer_kind: referrerKind,
            });

            const deleted = yield* ownerAffected(
              `DELETE FROM asset_references
               WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
                 AND referrer_id = $4`,
              [TEAM_A, hash, referrerKind, pin.referrer_id],
            );
            expect(deleted).toBe(1);
          }),
      );
    });

    // The other half of the same promise. Freezing only UPDATE and DELETE
    // would leave a pin insertable after publication — and then
    // unretractable, because the trigger above refuses to remove it.
    describe('asset_references_insert_frozen', () => {
      it.effect.each(VERSION_KINDS)(
        'admits a %s pin written in the transaction that publishes it',
        (referrerKind) =>
          Effect.gen(function* () {
            const hash = yield* newAsset();
            const referrerId = yield* pinAtPublication(referrerKind, hash);

            const pinned = yield* ownerRows(
              `SELECT count(*)::int AS n FROM asset_references
               WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
                 AND referrer_id = $4`,
              [TEAM_A, hash, referrerKind, referrerId],
            );
            expect(pinned[0]).toEqual({ n: 1 });
          }),
      );

      it.effect.each(PUBLISHED_KINDS)(
        'refuses a %s pin written after that transaction commits',
        (referrerKind) =>
          Effect.gen(function* () {
            const hash = yield* newAsset();
            const referrerId = yield* inTransaction(
              createReferrer(referrerKind),
            );

            const refused = yield* refusalOf(
              ownerInsert(
                'asset_references',
                referenceRow(hash, {
                  referrer_kind: referrerKind,
                  referrer_id: referrerId,
                }),
              ),
            );
            expect(refused.message).toContain(
              `an asset reference cannot be added to a published ${referrerKind}`,
            );
          }),
      );

      it.effect(
        'fixes a consent document’s pins at publication, by state rather than by transaction',
        () =>
          Effect.gen(function* () {
            // A published document is still updated afterwards — retired,
            // restamped — and each update gives its row a fresh xmin, so "the
            // transaction that published it" is not a stable fact to prove a
            // pin against. What is stable is the state: pins are free while
            // the document is a draft and refused from publication on, even
            // inside the publishing transaction.
            const harness = yield* TestDatabase;
            const kept = yield* newAsset();
            const late = yield* newAsset();
            const documentId = yield* inTransaction(
              Effect.gen(function* () {
                const id = yield* createReferrer('consent_document', {
                  published: false,
                });
                yield* inOwnerTransaction(
                  ...insertSql(
                    'asset_references',
                    referenceRow(kept, {
                      referrer_kind: 'consent_document',
                      referrer_id: id,
                    }),
                  ),
                );
                yield* inOwnerTransaction(
                  `UPDATE consent_documents SET state = 'published', published_at = now()
                   WHERE id = $1`,
                  [id],
                );
                // Behind a savepoint (a nested `withTransaction`), so the
                // refusal leaves the rest of the publishing transaction — and
                // the pin it legitimately carries — to commit.
                const refused = yield* refusalOf(
                  harness.owner.sql.withTransaction(
                    inOwnerTransaction(
                      ...insertSql(
                        'asset_references',
                        referenceRow(late, {
                          referrer_kind: 'consent_document',
                          referrer_id: id,
                        }),
                      ),
                    ),
                  ),
                );
                expect(refused.message).toContain(
                  'an asset reference cannot be added to a published consent_document',
                );
                return id;
              }),
            );

            const pinned = yield* ownerRows(
              `SELECT count(*)::int AS n FROM asset_references
               WHERE team_id = $1 AND referrer_kind = 'consent_document'
                 AND referrer_id = $2`,
              [TEAM_A, documentId],
            );
            expect(pinned[0]).toEqual({ n: 1 });
          }),
      );

      it.effect.each(PUBLISHED_KINDS)(
        'refuses a %s pin that names no such referrer',
        (referrerKind) =>
          Effect.gen(function* () {
            // Such a pin could never be retracted either, and admitting it
            // would let a pin be written before the version it claims to
            // belong to.
            const hash = yield* newAsset();

            const refused = yield* refusalOf(
              ownerInsert(
                'asset_references',
                referenceRow(hash, {
                  referrer_kind: referrerKind,
                  referrer_id: randomUUID(),
                }),
              ),
            );
            expect(refused.message).toContain(
              `an asset reference must name a ${referrerKind} of its own team`,
            );
          }),
      );

      it.effect('lets a draft consent document gain a pin at any time', () =>
        Effect.gen(function* () {
          // A draft is still being written, and its pins are not yet frozen;
          // the window closes when the document publishes.
          const hash = yield* newAsset();
          const documentId = yield* inTransaction(
            createReferrer('consent_document', { published: false }),
          );

          expect(
            yield* ownerInsert(
              'asset_references',
              referenceRow(hash, {
                referrer_kind: 'consent_document',
                referrer_id: documentId,
              }),
            ),
          ).toBe(1);
        }),
      );

      it.effect.each(['section', 'message_template'])(
        'leaves a %s pin free to be written at any time',
        (referrerKind) =>
          Effect.gen(function* () {
            // Neither kind's pins are frozen, so there is no frozen set to
            // protect and nothing for the insert guard to prove.
            const hash = yield* newAsset();

            expect(
              yield* ownerInsert(
                'asset_references',
                referenceRow(hash, { referrer_kind: referrerKind }),
              ),
            ).toBe(1);
          }),
      );
    });

    describe('garbage-collection semantics', () => {
      it.effect('makes a pinned asset structurally undeletable', () =>
        Effect.gen(function* () {
          const hash = yield* newAsset();
          const pin = yield* newReference(hash);

          const refused = yield* refusalOf(
            ownerAffected(
              `DELETE FROM assets WHERE team_id = $1 AND hash = $2`,
              [TEAM_A, hash],
            ),
          );
          expect(refused).toMatchObject({
            state: '23503',
            constraint: 'asset_references_asset_fk',
          });

          // The sweep's own order: retract the last pin, then delete the row.
          yield* ownerAffected(
            `DELETE FROM asset_references
             WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
               AND referrer_id = $4`,
            [TEAM_A, hash, pin.referrer_kind, pin.referrer_id],
          );
          const deleted = yield* ownerAffected(
            `DELETE FROM assets WHERE team_id = $1 AND hash = $2`,
            [TEAM_A, hash],
          );
          expect(deleted).toBe(1);
        }),
      );

      it.effect('marks only the assets no surviving pin references', () =>
        Effect.gen(function* () {
          const pinned = yield* newAsset();
          const orphan = yield* newAsset();
          yield* newReference(pinned);

          // The mark phase, as the protocol store's sweep writes it
          // (src/jobs/handlers/protocol-store-gc.ts).
          const marked = yield* ownerRows<{ hash: string }>(
            `UPDATE assets a SET unreferenced_at = clock_timestamp()
             WHERE a.team_id = $1
               AND a.unreferenced_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM asset_references r
                 WHERE r.team_id = a.team_id AND r.asset_hash = a.hash
               )
               AND a.hash = ANY($2::text[])
             RETURNING a.hash`,
            [TEAM_A, [pinned, orphan]],
          );
          expect(marked.map((row) => row.hash)).toEqual([orphan]);
        }),
      );
    });

    it.effect('scopes reads and writes to the team that owns them', () =>
      Effect.gen(function* () {
        const mine = yield* newAsset();
        const theirs = yield* newAsset({ team_id: TEAM_B });

        const visible = yield* tenantRows(
          TEAM_A,
          `SELECT hash FROM assets WHERE hash = ANY($1::text[])`,
          [[mine, theirs]],
        );
        expect(visible).toEqual([{ hash: mine }]);

        const refused = yield* refusalOf(
          tenantRows(
            TEAM_A,
            `INSERT INTO assets (team_id, hash, media_type, media_class, byte_size,
                                 original_filename, origin)
             VALUES ($1, $2, 'image/png', 'image', 1, 'x.png', 'upload')`,
            [TEAM_B, hex64()],
          ),
        );
        expect(refused.state).toBe('42501');
      }),
    );
  });
});
