// The half of the #1897 exclusion rule that is enforced in code today (#1900):
// an assembled protocol document never leaves the store carrying an API key.
// #1897 extends this file — when logs, spans, metrics, error reports and
// analytics gain sinks, each one gets its cases here, against the rule stated
// at the top of `../exclusion.ts`.
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { testCipher } from '../../__tests__/support/secrets.ts';
import {
  baseProtocol,
  makeStoreSchema,
  storeDb,
} from '../../protocol/__tests__/helpers.ts';
import { ProtocolStore } from '../../protocol/store.ts';
import { AssetKeyLeakError, assertNoAssetKeyValues } from '../exclusion.ts';

const API_KEY = 'pk.eyJ1IjoiZXhjbHVzaW9uIiwiYSI6Im5vdC1hLXJlYWwta2V5In0';
const ASSET_ID = 'mapKey';

function protocolWithKey(): CurrentProtocol {
  return {
    ...baseProtocol(),
    assetManifest: {
      [ASSET_ID]: { name: 'Map token', type: 'apikey', value: API_KEY },
    },
  } as unknown as CurrentProtocol;
}

describe('assertNoAssetKeyValues', () => {
  it('passes a document whose apikey assets are redacted', () => {
    expect(() =>
      assertNoAssetKeyValues({
        name: 'A protocol',
        assetManifest: {
          [ASSET_ID]: { name: 'Map token', type: 'apikey' },
          map: { name: 'Districts', type: 'geojson', source: 'd.geojson' },
        },
      }),
    ).not.toThrow();
  });

  it('refuses one carrying a value, naming the asset and not the key', () => {
    let thrown: unknown;
    try {
      assertNoAssetKeyValues({
        assetManifest: { [ASSET_ID]: { type: 'apikey', value: API_KEY } },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AssetKeyLeakError);
    expect((thrown as Error).message).toContain(ASSET_ID);
    // The refusal is itself somewhere a key could leak: it is raised precisely
    // when one is in hand, and an error message travels into every log.
    expect((thrown as Error).message).not.toContain(API_KEY);
  });

  it('refuses an apikey entry whose value is null or empty', () => {
    // Anything carrying the property at all: the stored shape has none, so a
    // document that has one came from somewhere other than the store — which
    // is the fact worth refusing on, not whether that value is usable.
    for (const value of [null, '', 0]) {
      expect(() =>
        assertNoAssetKeyValues({
          assetManifest: { [ASSET_ID]: { type: 'apikey', value } },
        }),
      ).toThrow(AssetKeyLeakError);
    }
  });

  it('passes a document with no asset manifest of its own', () => {
    expect(() => assertNoAssetKeyValues({ name: 'A protocol' })).not.toThrow();
    expect(() =>
      assertNoAssetKeyValues({ assetManifest: 'not an object' }),
    ).not.toThrow();
  });
});

describe.skipIf(!storeDb)('documents leaving the protocol store', () => {
  let db: pg.Pool;
  let tenantDb: TenantDb;
  let dispose: () => Promise<void>;
  let store: ProtocolStore;

  beforeAll(async () => {
    ({ db, tenantDb, dispose } = await makeStoreSchema());
    store = new ProtocolStore(tenantDb, testCipher());
  });
  afterAll(async () => {
    await dispose();
  });

  it('assembles a protocol that holds a key, without refusing it', async () => {
    // The check must not fire on the shape the store actually produces, on
    // either exit — a false refusal here would take out every read of every
    // protocol that has an API key.
    const { draftId } = await store.createProtocol({
      protocol: protocolWithKey(),
    });
    const published = await store.publishDraft({ draftId, label: 'v1' });
    if (published.status !== 'published') {
      throw new Error(`the fixture did not publish: ${published.status}`);
    }

    for (const document of [
      await store.getDraftDocument(draftId),
      await store.getVersionDocument(published.versionId),
    ]) {
      const manifest = document.assetManifest as Record<string, unknown>;
      expect(manifest[ASSET_ID]).toEqual({ name: 'Map token', type: 'apikey' });
      expect(JSON.stringify(document)).not.toContain(API_KEY);
    }
  });

  it('refuses to hand out a document a key found its way back into', async () => {
    const { draftId } = await store.createProtocol({
      protocol: protocolWithKey(),
    });
    const published = await store.publishDraft({ draftId, label: 'v1' });
    if (published.status !== 'published') {
      throw new Error(`the fixture did not publish: ${published.status}`);
    }

    // The oracle. Nothing in the application can produce this state — the
    // write boundary strips the value and two triggers refuse it — so the
    // trigger and the immutability rule are lifted, as the owner, to stage
    // exactly the state this check exists for: a section document that
    // carries a key. If the check were not wired into the assembly exits,
    // both reads below would hand the key back.
    const assets = sectionId({ kind: 'assets' });
    await db.query('ALTER TABLE sections DISABLE TRIGGER sections_immutable');
    await db.query(
      'ALTER TABLE sections DISABLE TRIGGER sections_hold_no_asset_keys',
    );
    try {
      const updated = await db.query(
        `UPDATE sections s
            SET doc = jsonb_set(s.doc, $1::text[], to_jsonb($2::text))
           FROM manifests m, drafts d
          WHERE d.id = $3::uuid
            AND m.hash = d.head_manifest_hash
            AND m.team_id = d.team_id
            AND s.hash = m.section_hashes ->> $4
            AND s.team_id = d.team_id`,
        [[ASSET_ID, 'value'], API_KEY, draftId, assets],
      );
      expect(updated.rowCount).toBe(1);
    } finally {
      await db.query('ALTER TABLE sections ENABLE TRIGGER sections_immutable');
      await db.query(
        'ALTER TABLE sections ENABLE TRIGGER sections_hold_no_asset_keys',
      );
    }

    // The published version pins the same content-addressed row, so one edit
    // poisons both exits.
    await expect(store.getDraftDocument(draftId)).rejects.toThrow(
      AssetKeyLeakError,
    );
    await expect(store.getVersionDocument(published.versionId)).rejects.toThrow(
      AssetKeyLeakError,
    );
  });
});
