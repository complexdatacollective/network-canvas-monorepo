import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';

// The app must boot over a database created by the RELEASED Dexie-v1 schema
// without wiping or orphaning anything. These tests seed that database for
// real — on a blank same-origin page, before any app code has run — by
// injecting Dexie's own UMD bundle and declaring the exact version(1) schema
// the released app shipped, then navigate to the app and assert the upgraded
// database still serves every row through the real UI.
//
// The unit-level counterpart (src/lib/db/__tests__/db.upgrade.test.ts) covers
// both historical versions and the encrypted-at-rest row variants; this spec
// covers what jsdom cannot: the full boot path in a real browser, including
// plaintext Blob assets, which jsdom's fake-indexeddb cannot round-trip.
const DEXIE_UMD_PATH = createRequire(import.meta.url).resolve('dexie');

const PROTOCOL_JSON_PATH = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/interviewer-e2e/protocol.json',
);

const LEGACY_PROTOCOL_NAME = 'Legacy Study';
// The app treats a stored protocol's hash as an opaque key (the boot sweep
// only re-hashes when it migrates a below-version document), so the seed can
// use a recognisable constant instead of computing the structural hash.
const LEGACY_HASH = 'legacy-e2e-protocol-hash';
const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];

type SeedAsset = {
  row: Record<string, unknown>;
  blobBytes?: number[];
  blobMime?: string;
};

type LegacySeed = {
  protocolRow: Record<string, unknown>;
  sessionRows: Record<string, unknown>[];
  assetRows: SeedAsset[];
  settingsRow: Record<string, unknown>;
};

type FixtureProtocol = { schemaVersion: number } & Record<string, unknown>;

// Entity keys and codebook/stage identifiers are literals here because this
// seed represents rows an old release already wrote — they are frozen data,
// not references into today's source. The network is consistent with the lean
// fixture's codebook ('person' nodes, 'knows' edge, quick-add stage 'stage-ng'
// prompt 'p1') so the interview engine can genuinely hydrate it.
function legacyNetwork(): Record<string, unknown> {
  return {
    ego: { _uid: 'legacy-ego', attributes: { ego_name: 'Legacy Ego' } },
    nodes: [
      {
        _uid: 'legacy-n1',
        type: 'person',
        stageId: 'stage-ng',
        promptIDs: ['p1'],
        attributes: { name: 'Legacy Alice' },
      },
      {
        _uid: 'legacy-n2',
        type: 'person',
        stageId: 'stage-ng',
        promptIDs: ['p1'],
        attributes: { name: 'Legacy Bob' },
      },
    ],
    edges: [
      {
        _uid: 'legacy-e1',
        type: 'knows',
        from: 'legacy-n1',
        to: 'legacy-n2',
        attributes: {},
      },
    ],
  };
}

function buildLegacySeed(): {
  seed: LegacySeed;
  documentSchemaVersion: number;
} {
  const document = JSON.parse(
    readFileSync(PROTOCOL_JSON_PATH, 'utf8'),
  ) as FixtureProtocol;

  const seed: LegacySeed = {
    protocolRow: {
      id: LEGACY_HASH,
      hash: LEGACY_HASH,
      name: LEGACY_PROTOCOL_NAME,
      schemaVersion: document.schemaVersion,
      importedAt: '2026-01-01T00:00:00.000Z',
      codebook: document.codebook,
      protocol: { ...document, name: LEGACY_PROTOCOL_NAME },
    },
    sessionRows: [
      {
        id: 'legacy-session-complete',
        protocolHash: LEGACY_HASH,
        protocolName: LEGACY_PROTOCOL_NAME,
        caseId: 'legacy-case-complete',
        startedAt: '2026-01-05T10:00:00.000Z',
        lastUpdatedAt: '2026-01-05T11:00:00.000Z',
        finishedAt: '2026-01-05T11:00:00.000Z',
        exportedAt: null,
        currentStep: 3,
        progress: 100,
        network: legacyNetwork(),
      },
      // Deliberately has no `progress` field — a row written before the field
      // existed — and rests on the quick-add stage (index 2) so resuming it
      // must rehydrate the legacy network.
      {
        id: 'legacy-session-in-progress',
        protocolHash: LEGACY_HASH,
        protocolName: LEGACY_PROTOCOL_NAME,
        caseId: 'legacy-case-in-progress',
        startedAt: '2026-01-07T10:00:00.000Z',
        lastUpdatedAt: '2026-01-07T10:30:00.000Z',
        finishedAt: null,
        exportedAt: null,
        currentStep: 2,
        network: legacyNetwork(),
      },
    ],
    assetRows: [
      // A raw plaintext Blob — the variant the unit suite cannot cover.
      {
        row: {
          id: `${LEGACY_HASH}::legacy-image`,
          protocolHash: LEGACY_HASH,
          assetId: 'legacy-image',
          name: 'Background',
          type: 'image',
        },
        blobBytes: PNG_BYTES,
        blobMime: 'image/png',
      },
      {
        row: {
          id: `${LEGACY_HASH}::legacy-key`,
          protocolHash: LEGACY_HASH,
          assetId: 'legacy-key',
          name: 'Map key',
          type: 'apikey',
          data: 'legacy-secret',
        },
      },
    ],
    // A partial settings row, as an older release wrote it. The dismissed
    // sample protocol doubles as a UI oracle: if the upgrade lost this row,
    // the sample card reappears on Home.
    settingsRow: {
      id: 'device',
      exportGraphML: false,
      sampleProtocolDismissed: true,
    },
  };

  return { seed, documentSchemaVersion: document.schemaVersion };
}

// Seeds the legacy database on a blank same-origin page. Must run before the
// app has ever been navigated to in this context — the in-page guard throws
// if the database already exists at a newer version.
async function seedLegacyDatabase(page: Page, seed: LegacySeed): Promise<void> {
  await page.route('**/__legacy-seed__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>legacy seed</title>',
    }),
  );
  await page.goto('/__legacy-seed__');
  await page.addScriptTag({ path: DEXIE_UMD_PATH });

  await page.evaluate(async (input) => {
    type LegacyTable = {
      put(row: unknown): Promise<unknown>;
      bulkPut(rows: unknown[]): Promise<unknown>;
    };
    type LegacyDexie = {
      version(no: number): { stores(schema: Record<string, string>): void };
      open(): Promise<unknown>;
      close(): void;
      backendDB(): IDBDatabase;
      table(name: string): LegacyTable;
    };
    const DexieCtor = (window as { Dexie?: new (name: string) => LegacyDexie })
      .Dexie;
    if (!DexieCtor) throw new Error('Dexie UMD bundle was not injected');

    const legacy = new DexieCtor('interviewer');
    // Frozen copy of the version(1) declaration the released app created
    // databases with. Never update this to track src/lib/db/db.ts — seeding
    // through an independent copy is what lets these tests detect an
    // incompatible edit to the shipped schema history.
    legacy.version(1).stores({
      protocols: 'id, hash, name, importedAt',
      sessions:
        'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
      assets: 'id, protocolHash, assetId',
      settings: 'id',
    });
    await legacy.open();

    // Dexie maps declared version 1 to native version 10 (a mapping the unit
    // suite also pins). Anything else means the app already opened and
    // upgraded this database, and the test would silently stop testing the
    // upgrade path.
    const nativeVersion = legacy.backendDB().version;
    if (nativeVersion !== 10) {
      throw new Error(
        `expected a fresh legacy database at native version 10, got ${nativeVersion}`,
      );
    }

    await legacy.table('protocols').put(input.protocolRow);
    await legacy.table('sessions').bulkPut(input.sessionRows);
    await legacy.table('assets').bulkPut(
      input.assetRows.map((asset) =>
        asset.blobBytes && asset.blobMime
          ? {
              ...asset.row,
              data: new Blob([new Uint8Array(asset.blobBytes)], {
                type: asset.blobMime,
              }),
            }
          : asset.row,
      ),
    );
    await legacy.table('settings').put(input.settingsRow);
    legacy.close();
  }, seed);
}

test.describe('booting over a legacy (Dexie v1) database', () => {
  test('upgrades in place: deck, data view, and every stored row survive', async ({
    page,
  }) => {
    const { seed, documentSchemaVersion } = buildLegacySeed();
    await seedLegacyDatabase(page, seed);

    await page.goto('/');

    // The legacy protocol reaches the deck…
    await expect(
      page.getByRole('heading', { name: LEGACY_PROTOCOL_NAME }),
    ).toBeVisible();
    // …and the surviving settings row still suppresses the sample card. (A
    // wiped settings row would re-show it: sampleProtocolDismissed defaults
    // to false.)
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toHaveCount(0);

    // Both legacy sessions appear on /data with the right derived statuses.
    await page.goto('/data');
    await expect(page.getByRole('button', { name: /^All · 2/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^In progress · 1/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Complete · 1/ }),
    ).toBeVisible();
    await expect(page.getByText('legacy-case-complete')).toBeVisible();
    await expect(page.getByText('legacy-case-in-progress')).toBeVisible();

    // The upgraded database itself: current native version, all stores, and
    // every seeded row intact. Reads are hash-relative so this keeps passing
    // if a future boot sweep legitimately re-keys the protocol; a wipe or
    // orphaning still fails.
    const state = await page.evaluate(async () => {
      const idb = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('interviewer');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
      const readAll = (store: string) =>
        new Promise<unknown[]>((resolve, reject) => {
          const req = idb
            .transaction(store, 'readonly')
            .objectStore(store)
            .getAll();
          req.onsuccess = () => resolve(req.result as unknown[]);
          req.onerror = () =>
            reject(req.error ?? new Error(`getAll(${store}) failed`));
        });

      type ProtocolRow = {
        id: string;
        hash: string;
        name: string;
        schemaVersion: number;
        protocol?: unknown;
        codebook?: unknown;
      };
      type SessionRow = {
        id: string;
        protocolHash: string;
        caseId: string;
        currentStep: number;
        finishedAt: string | null;
        network?: {
          nodes?: { attributes?: Record<string, unknown> }[];
          edges?: unknown[];
        };
      };
      type AssetRow = {
        id: string;
        protocolHash: string;
        assetId: string;
        data?: unknown;
      };

      const protocols = (await readAll('protocols')) as ProtocolRow[];
      const sessions = (await readAll('sessions')) as SessionRow[];
      const assets = (await readAll('assets')) as AssetRow[];
      const settings = (await readAll('settings')) as {
        id: string;
        [key: string]: unknown;
      }[];

      const assetData = await Promise.all(
        assets.map(async (asset) => {
          if (asset.data instanceof Blob) {
            const bytes = Array.from(
              new Uint8Array(await asset.data.arrayBuffer()),
            );
            return {
              assetId: asset.assetId,
              protocolHash: asset.protocolHash,
              kind: 'blob' as const,
              mime: asset.data.type,
              bytes,
            };
          }
          return {
            assetId: asset.assetId,
            protocolHash: asset.protocolHash,
            kind: 'string' as const,
            value: String(asset.data),
          };
        }),
      );

      const result = {
        nativeVersion: idb.version,
        storeNames: Array.from(idb.objectStoreNames).toSorted(),
        protocols: protocols.map((p) => ({
          id: p.id,
          hash: p.hash,
          name: p.name,
          schemaVersion: p.schemaVersion,
          hasDocument: p.protocol !== undefined && p.codebook !== undefined,
        })),
        sessions: sessions
          .map((s) => ({
            id: s.id,
            protocolHash: s.protocolHash,
            caseId: s.caseId,
            currentStep: s.currentStep,
            finishedAt: s.finishedAt,
            nodeNames: (s.network?.nodes ?? [])
              .map((n) => String(n.attributes?.name))
              .toSorted(),
            edgeCount: (s.network?.edges ?? []).length,
          }))
          .toSorted((a, b) => a.id.localeCompare(b.id)),
        assets: assetData.toSorted((a, b) =>
          a.assetId.localeCompare(b.assetId),
        ),
        settings: settings.find((s) => s.id === 'device'),
      };
      idb.close();
      return result;
    });

    // Native version = declared Dexie version × 10. When db.ts gains a
    // version(4) this becomes 40 — update it together with the unit suite's
    // CURRENT_DEXIE_VERSION, which forces a seed for the new version there.
    expect(state.nativeVersion).toBe(30);
    expect(state.storeNames).toEqual([
      'assets',
      'protocolMigrations',
      'protocols',
      'sessions',
      'settings',
    ]);

    expect(state.protocols).toHaveLength(1);
    const protocolRow = state.protocols[0];
    if (!protocolRow) throw new Error('expected the protocol row to survive');
    const liveHash = protocolRow.hash;
    expect(liveHash).not.toBe('');
    expect(protocolRow.id).toBe(liveHash);
    expect(protocolRow.name).toBe(LEGACY_PROTOCOL_NAME);
    expect(protocolRow.hasDocument).toBe(true);
    expect(protocolRow.schemaVersion).toBeGreaterThanOrEqual(
      documentSchemaVersion,
    );

    expect(state.sessions).toEqual([
      {
        id: 'legacy-session-complete',
        protocolHash: liveHash,
        caseId: 'legacy-case-complete',
        currentStep: 3,
        finishedAt: '2026-01-05T11:00:00.000Z',
        nodeNames: ['Legacy Alice', 'Legacy Bob'],
        edgeCount: 1,
      },
      {
        id: 'legacy-session-in-progress',
        protocolHash: liveHash,
        caseId: 'legacy-case-in-progress',
        currentStep: 2,
        finishedAt: null,
        nodeNames: ['Legacy Alice', 'Legacy Bob'],
        edgeCount: 1,
      },
    ]);

    expect(state.assets).toEqual([
      {
        assetId: 'legacy-image',
        protocolHash: liveHash,
        kind: 'blob',
        mime: 'image/png',
        bytes: PNG_BYTES,
      },
      {
        assetId: 'legacy-key',
        protocolHash: liveHash,
        kind: 'string',
        value: 'legacy-secret',
      },
    ]);

    expect(state.settings).toMatchObject({
      exportGraphML: false,
      sampleProtocolDismissed: true,
    });
  });

  test('resumes an in-progress interview stored by the legacy schema', async ({
    page,
    interviewNav,
  }) => {
    const { seed } = buildLegacySeed();
    await seedLegacyDatabase(page, seed);

    await page.goto('/data');
    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await page.getByTestId('data-resume').first().click();

    // The seeded row is the one that resumed…
    await expect(page).toHaveURL(/\/interview\/legacy-session-in-progress/);
    await interviewNav.waitForStage();

    // …on the quick-add stage its currentStep pointed at, with the legacy
    // network fully rehydrated into the roster.
    await expect(page.getByText('Who are the people you know?')).toBeVisible();
    await expect(
      page.getByRole('option', { name: 'Legacy Alice' }),
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: 'Legacy Bob' }),
    ).toBeVisible();
  });
});
