// The asset metadata tables' database-enforced promises: the defaults, every
// CHECK, the composite foreign key that keeps a pin inside its own tenant, the
// two sidecar triggers that freeze asset metadata and published pins, and the
// unreferenced marker the garbage collector moves.
//
// Every case asserts the rejection Postgres actually raises — the constraint
// name for a CHECK or foreign-key violation, the message for a trigger — so a
// guard that stopped firing cannot pass as "no error".
import { randomBytes } from 'node:crypto';

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

describe.skipIf(!db)('asset schema', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;

  // The connecting login is the development superuser, so it bypasses the
  // row-level security policies but not the triggers or constraints: exactly
  // the fixture tool these cases want.
  const insert = (table: string, row: Row) => {
    const columns = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

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

  async function newAsset(overrides: Row = {}): Promise<string> {
    const row = assetRow(overrides);
    await insert('assets', row);
    return row.hash as string;
  }

  async function newReference(
    assetHash: string,
    overrides: Row = {},
  ): Promise<Row> {
    const row = referenceRow(assetHash, overrides);
    await insert('asset_references', row);
    return row;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of [TEAM_A, TEAM_B]) await seedTeam(pool, teamId);
    tenantA = createTenantDb(app, TEAM_A);
  });
  afterAll(async () => {
    await dispose();
  });

  describe('assets', () => {
    it('applies the documented defaults', async () => {
      const hash = await newAsset();

      const row = await pool.query<Row>(
        `SELECT uploaded_by_user_id, dataset_metadata, unreferenced_at,
                created_at IS NOT NULL AS stamped,
                created_at <= clock_timestamp() AS wall_clock
         FROM assets WHERE team_id = $1 AND hash = $2`,
        [TEAM_A, hash],
      );
      expect(row.rows[0]).toEqual({
        uploaded_by_user_id: null,
        dataset_metadata: null,
        unreferenced_at: null,
        stamped: true,
        wall_clock: true,
      });
    });

    it.each([
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
    ])('rejects %s', async (_label, overrides, constraint) => {
      await expect(insert('assets', assetRow(overrides))).rejects.toMatchObject(
        { constraint },
      );
    });

    it('accepts the shapes the checks exist to admit', async () => {
      await expect(
        insert(
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
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('deduplicates per team rather than across the tenant boundary', async () => {
      const hash = await newAsset();

      await expect(insert('assets', assetRow({ hash }))).rejects.toMatchObject({
        code: '23505',
      });
      // The same bytes in another team are a different row, by design.
      await expect(
        insert('assets', assetRow({ hash, team_id: TEAM_B })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('asset_references', () => {
    it.each([
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
    ])('rejects %s', async (_label, overrides, constraint) => {
      const hash = await newAsset();
      await expect(
        insert('asset_references', referenceRow(hash, overrides)),
      ).rejects.toMatchObject({ constraint });
    });

    it('refuses a pin on an asset that does not exist', async () => {
      await expect(
        insert('asset_references', referenceRow(hex64())),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'asset_references_asset_fk',
      });
    });

    it("refuses a pin on another team's asset", async () => {
      const hash = await newAsset({ team_id: TEAM_B });

      // Referential integrity bypasses row-level security, so the composite
      // key is what stops one team citing another team's content hash.
      await expect(
        insert('asset_references', referenceRow(hash, { team_id: TEAM_A })),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'asset_references_asset_fk',
      });
      await expect(
        insert('asset_references', referenceRow(hash, { team_id: TEAM_B })),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it('pins the same asset once per referrer', async () => {
      const hash = await newAsset();
      const pin = await newReference(hash, { referrer_id: 'section-1' });

      await expect(insert('asset_references', pin)).rejects.toMatchObject({
        code: '23505',
      });
      // A second referrer, and a second kind, are separate pins.
      await expect(
        insert(
          'asset_references',
          referenceRow(hash, { referrer_id: 'section-2' }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        insert(
          'asset_references',
          referenceRow(hash, {
            referrer_kind: 'message_template',
            referrer_id: 'section-1',
          }),
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('assets_metadata_immutable', () => {
    it.each([
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
    ])('refuses to rewrite %s', async (_label, assignment) => {
      const hash = await newAsset();

      await expect(
        pool.query(
          `UPDATE assets SET ${assignment} WHERE team_id = $1 AND hash = $2`,
          [TEAM_A, hash],
        ),
      ).rejects.toThrow('asset metadata is immutable');
    });

    it('lets the sweep marker move in both directions', async () => {
      const hash = await newAsset();

      const marked = await pool.query(
        `UPDATE assets SET unreferenced_at = clock_timestamp()
         WHERE team_id = $1 AND hash = $2`,
        [TEAM_A, hash],
      );
      expect(marked.rowCount).toBe(1);
      const swept = await pool.query<{ marked: boolean }>(
        `SELECT unreferenced_at IS NOT NULL AS marked FROM assets
         WHERE team_id = $1 AND hash = $2`,
        [TEAM_A, hash],
      );
      expect(swept.rows[0]).toEqual({ marked: true });

      // Reconciliation clears the marker when a pin reappears.
      const reconciled = await pool.query(
        `UPDATE assets SET unreferenced_at = NULL
         WHERE team_id = $1 AND hash = $2`,
        [TEAM_A, hash],
      );
      expect(reconciled.rowCount).toBe(1);
      const cleared = await pool.query<{ marked: boolean }>(
        `SELECT unreferenced_at IS NOT NULL AS marked FROM assets
         WHERE team_id = $1 AND hash = $2`,
        [TEAM_A, hash],
      );
      expect(cleared.rows[0]).toEqual({ marked: false });
    });
  });

  describe('asset_references_published_immutable', () => {
    it.each(['protocol_version', 'template_version', 'consent_document'])(
      'freezes a %s pin against update and retraction',
      async (referrerKind) => {
        const hash = await newAsset();
        const pin = await newReference(hash, { referrer_kind: referrerKind });

        await expect(
          pool.query(
            `UPDATE asset_references SET created_at = now()
             WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
               AND referrer_id = $4`,
            [TEAM_A, hash, referrerKind, pin.referrer_id],
          ),
        ).rejects.toThrow('published asset references are immutable');
        await expect(
          pool.query(
            `DELETE FROM asset_references
             WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
               AND referrer_id = $4`,
            [TEAM_A, hash, referrerKind, pin.referrer_id],
          ),
        ).rejects.toThrow('published asset references are immutable');
      },
    );

    it.each(['section', 'message_template'])(
      'lets a %s pin be retracted, because its referrer is still editable',
      async (referrerKind) => {
        const hash = await newAsset();
        const pin = await newReference(hash, { referrer_kind: referrerKind });

        const deleted = await pool.query(
          `DELETE FROM asset_references
           WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
             AND referrer_id = $4`,
          [TEAM_A, hash, referrerKind, pin.referrer_id],
        );
        expect(deleted.rowCount).toBe(1);
      },
    );
  });

  describe('garbage-collection semantics', () => {
    it('makes a pinned asset structurally undeletable', async () => {
      const hash = await newAsset();
      const pin = await newReference(hash);

      await expect(
        pool.query(`DELETE FROM assets WHERE team_id = $1 AND hash = $2`, [
          TEAM_A,
          hash,
        ]),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'asset_references_asset_fk',
      });

      // The sweep's own order: retract the last pin, then delete the row.
      await pool.query(
        `DELETE FROM asset_references
         WHERE team_id = $1 AND asset_hash = $2 AND referrer_kind = $3
           AND referrer_id = $4`,
        [TEAM_A, hash, pin.referrer_kind, pin.referrer_id],
      );
      const deleted = await pool.query(
        `DELETE FROM assets WHERE team_id = $1 AND hash = $2`,
        [TEAM_A, hash],
      );
      expect(deleted.rowCount).toBe(1);
    });

    it('marks only the assets no surviving pin references', async () => {
      const pinned = await newAsset();
      const orphan = await newAsset();
      await newReference(pinned);

      // The mark phase, as protocol/gc.ts writes it.
      const marked = await pool.query<{ hash: string }>(
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
      expect(marked.rows.map((row) => row.hash)).toEqual([orphan]);
    });
  });

  it('scopes reads and writes to the team that owns them', async () => {
    const mine = await newAsset();
    const theirs = await newAsset({ team_id: TEAM_B });

    const visible = await tenantA.query(
      `SELECT hash FROM assets WHERE hash = ANY($1::text[])`,
      [[mine, theirs]],
    );
    expect(visible.rows).toEqual([{ hash: mine }]);

    await expect(
      tenantA.query(
        `INSERT INTO assets (team_id, hash, media_type, media_class, byte_size,
                             original_filename, origin)
         VALUES ($1, $2, 'image/png', 'image', 1, 'x.png', 'upload')`,
        [TEAM_B, hex64()],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
