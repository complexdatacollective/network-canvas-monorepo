import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TenantDb } from '@codaco/studio-sync/tenant';

import { testCipher } from '../../__tests__/support/secrets.ts';
import { SecretUnreadableError } from '../../secrets/envelope.ts';
import {
  ASSET_KEY_PLACEHOLDER,
  assetsSectionHoldsNoKeys,
  openAssetKey,
  sealAssetKeys,
  stripAssetKeyValues,
  withPlaceholderAssetKeys,
} from '../asset-keys.ts';
import { ProtocolStore } from '../store.ts';
import {
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  storeDb,
} from './helpers.ts';

const MAPBOX_KEY = 'pk.eyJ1IjoicmVzZWFyY2hlciIsImEiOiJub3QtYS1yZWFsLWtleSJ9';

function assetsDoc(): Record<string, unknown> {
  return {
    mapKey: { name: 'Mapbox token', type: 'apikey', value: MAPBOX_KEY },
    map: { name: 'Districts', type: 'geojson', source: 'districts.geojson' },
  };
}

describe('stripAssetKeyValues', () => {
  it('takes the value out of an apikey entry and hands it back keyed by asset', () => {
    const { doc, values } = stripAssetKeyValues(assetsDoc());

    expect(doc.mapKey).toEqual({ name: 'Mapbox token', type: 'apikey' });
    expect(values.get('mapKey')).toBe(MAPBOX_KEY);
    expect(values.size).toBe(1);
  });

  it('leaves every other kind of asset exactly as it was', () => {
    const { doc } = stripAssetKeyValues(assetsDoc());

    expect(doc.map).toEqual({
      name: 'Districts',
      type: 'geojson',
      source: 'districts.geojson',
    });
  });

  it('does not copy a manifest that holds no keys', () => {
    // Identity, not just equality: a write that changes nothing must hash to
    // what it hashed before, and a fresh object would still do that — but this
    // is the cheaper guarantee, and it is the one the code makes.
    const doc = {
      map: { name: 'Districts', type: 'geojson', source: 'd.geojson' },
    };
    const stripped = stripAssetKeyValues(doc);

    expect(stripped.doc).toBe(doc);
    expect(stripped.values.size).toBe(0);
  });

  it('strips an apikey entry whose value is not a usable string, and seals nothing for it', () => {
    // `value: null` is still a value key, so the stored shape must lose it —
    // otherwise the database trigger would refuse the write the application
    // thought it had redacted.
    const { doc, values } = stripAssetKeyValues({
      broken: { name: 'Empty', type: 'apikey', value: null },
      blank: { name: 'Blank', type: 'apikey', value: '' },
    });

    expect(doc.broken).toEqual({ name: 'Empty', type: 'apikey' });
    expect(doc.blank).toEqual({ name: 'Blank', type: 'apikey' });
    expect(values.size).toBe(0);
  });
});

describe('assetsSectionHoldsNoKeys', () => {
  it('is true for a redacted manifest and false for one carrying a value', () => {
    expect(assetsSectionHoldsNoKeys(stripAssetKeyValues(assetsDoc()).doc)).toBe(
      true,
    );
    expect(assetsSectionHoldsNoKeys(assetsDoc())).toBe(false);
  });
});

describe('withPlaceholderAssetKeys', () => {
  it('fills a placeholder into every apikey asset that has no value', () => {
    const filled = withPlaceholderAssetKeys({
      name: 'A protocol',
      assetManifest: stripAssetKeyValues(assetsDoc()).doc,
    });

    const manifest = filled.assetManifest as Record<
      string,
      Record<string, unknown>
    >;
    expect(manifest.mapKey?.value).toBe(ASSET_KEY_PLACEHOLDER);
    expect(manifest.map).toEqual({
      name: 'Districts',
      type: 'geojson',
      source: 'districts.geojson',
    });
  });

  it('leaves a document with no assets alone', () => {
    const document = { name: 'A protocol' };
    expect(withPlaceholderAssetKeys(document)).toBe(document);
  });

  it('never overwrites a value that is already there', () => {
    // The staged path still carries real values in memory; a placeholder that
    // replaced one would validate a protocol the researcher never wrote.
    const filled = withPlaceholderAssetKeys({
      assetManifest: assetsDoc(),
    });
    const manifest = filled.assetManifest as Record<
      string,
      Record<string, unknown>
    >;
    expect(manifest.mapKey?.value).toBe(MAPBOX_KEY);
  });
});

describe.skipIf(!storeDb)('protocol_asset_keys', () => {
  let db: pg.Pool;
  let tenantDb: TenantDb;
  let dispose: () => Promise<void>;
  let protocolId: string;
  const cipher = testCipher();

  beforeAll(async () => {
    ({ db, tenantDb, dispose } = await makeStoreSchema());
    const created = await new ProtocolStore(tenantDb, cipher).createProtocol({
      protocol: baseProtocol(),
    });
    protocolId = created.protocolId;
  });
  afterAll(async () => {
    await dispose();
  });

  const seal = (assetId: string, value: string) =>
    tenantDb.transaction((client) =>
      sealAssetKeys(
        client,
        cipher,
        { teamId: TEST_TEAM_ID, protocolId },
        new Map([[assetId, value]]),
      ),
    );

  it('seals a value and opens it again', async () => {
    await seal('roundTrip', MAPBOX_KEY);

    await expect(
      openAssetKey(tenantDb, cipher, {
        teamId: TEST_TEAM_ID,
        protocolId,
        assetId: 'roundTrip',
      }),
    ).resolves.toBe(MAPBOX_KEY);
  });

  it('stores the key as ciphertext that does not contain it', async () => {
    await seal('opaque', MAPBOX_KEY);

    const row = await db.query(
      `SELECT ciphertext, key_id FROM protocol_asset_keys
       WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
      [TEST_TEAM_ID, protocolId, 'opaque'],
    );
    const stored = row.rows[0] as { ciphertext: Buffer; key_id: string };
    expect(stored.key_id).toBe('test-1');
    expect(stored.ciphertext.toString('utf8')).not.toContain(MAPBOX_KEY);
    expect(stored.ciphertext.toString('base64')).not.toContain(MAPBOX_KEY);
  });

  it('replaces the row when the researcher changes the key', async () => {
    await seal('rotated', 'first-value');
    await seal('rotated', 'second-value');

    const count = await db.query(
      `SELECT count(*)::int AS n FROM protocol_asset_keys
       WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
      [TEST_TEAM_ID, protocolId, 'rotated'],
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
    await expect(
      openAssetKey(tenantDb, cipher, {
        teamId: TEST_TEAM_ID,
        protocolId,
        assetId: 'rotated',
      }),
    ).resolves.toBe('second-value');
  });

  it('answers with nothing for an asset that has no row', async () => {
    await expect(
      openAssetKey(tenantDb, cipher, {
        teamId: TEST_TEAM_ID,
        protocolId,
        assetId: 'never-sealed',
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['another asset', { assetId: 'someone-else' }],
    ['another protocol', { protocolId: randomUUID() }],
    ['another team', { teamId: 'team-other' }],
  ])('refuses a ciphertext read as %s', async (_label, moved) => {
    await seal('bound', MAPBOX_KEY);
    const row = await db.query(
      `SELECT ciphertext, key_id FROM protocol_asset_keys
       WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
      [TEST_TEAM_ID, protocolId, 'bound'],
    );
    const stored = row.rows[0] as { ciphertext: Buffer; key_id: string };

    // The row identity is the AAD, so opening the same bytes against any other
    // row fails rather than handing back another team's key.
    expect(() =>
      cipher.openAssetKey(
        { teamId: TEST_TEAM_ID, protocolId, assetId: 'bound', ...moved },
        { ciphertext: stored.ciphertext, keyId: stored.key_id },
      ),
    ).toThrow(SecretUnreadableError);
  });
});

describe.skipIf(!storeDb)('the sections_hold_no_asset_keys trigger', () => {
  let db: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await makeStoreSchema());
  });
  afterAll(async () => {
    await dispose();
  });

  const insertSection = (hash: string, doc: unknown) =>
    db.query(`INSERT INTO sections (team_id, hash, doc) VALUES ($1, $2, $3)`, [
      TEST_TEAM_ID,
      hash,
      JSON.stringify(doc),
    ]);

  it('refuses a section document carrying an API key value', async () => {
    await expect(insertSection('with-key', assetsDoc())).rejects.toThrow(
      /must be sealed in protocol_asset_keys/,
    );
  });

  it('refuses one even when the value is null rather than a string', async () => {
    await expect(
      insertSection('null-key', {
        mapKey: { name: 'Mapbox token', type: 'apikey', value: null },
      }),
    ).rejects.toThrow(/must be sealed in protocol_asset_keys/);
  });

  it('admits the redacted manifest the write boundary produces', async () => {
    await expect(
      insertSection('redacted', stripAssetKeyValues(assetsDoc()).doc),
    ).resolves.toBeDefined();
  });

  it('admits documents that are not asset manifests at all', async () => {
    // Every section goes through this trigger, so a stage document whose own
    // fields happen to be objects must not be caught by it.
    await expect(
      insertSection('a-stage', {
        id: 'nameGenerator1',
        type: 'NameGenerator',
        subject: { entity: 'node', type: 'person' },
        form: { title: 'Add person', fields: [] },
      }),
    ).resolves.toBeDefined();
  });

  it('admits a document that is not an object', async () => {
    await expect(insertSection('an-array', ['a', 'b'])).resolves.toBeDefined();
  });
});
