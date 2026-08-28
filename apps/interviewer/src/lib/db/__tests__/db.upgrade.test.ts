// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  hashProtocol,
  migrateProtocol,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { db, getSettings } from '../db';
import { migrateStoredProtocols } from '../migrateStoredProtocols';
import {
  decryptAsset,
  decryptProtocol,
  decryptSession,
  encryptAsset,
  encryptProtocol,
  encryptSession,
  type StoredAssetRow,
  type StoredProtocolRow,
  type StoredSessionRow,
} from '../recordCrypto';
import { setSessionDek } from '../sessionKey';
import { countSyntheticSessions, deleteSyntheticSessions } from '../sessions';
import {
  DEFAULT_SETTINGS,
  type StoredAsset,
  type StoredProtocol,
  type StoredSession,
} from '../types';

// ---------------------------------------------------------------------------
// Frozen history. These literals are copies of the schema declarations the
// released app CREATED databases with — Dexie v1 (a4b08d828) and v2
// (04b74a6fc) — kept deliberately independent of db.ts. Seeding through an
// independent copy is the whole oracle: if db.ts's shipped version blocks are
// ever edited (renamed store, changed primary key, renumbered version), these
// tests open a genuinely old database against the new declarations and fail.
// Never "fix" a failure here by updating these literals to match db.ts; a
// divergence is a compatibility bug in db.ts.
// ---------------------------------------------------------------------------
const V1_STORES = {
  protocols: 'id, hash, name, importedAt',
  sessions:
    'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
  assets: 'id, protocolHash, assetId',
  settings: 'id',
};
const V2_SESSIONS_STORES = {
  sessions:
    'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
};

// The Dexie version db.ts currently declares. When a version(4) is added,
// this suite must grow a v3 seed in LEGACY_VERSIONS below alongside bumping
// this constant — a bare bump here ships the new upgrade step untested.
const CURRENT_DEXIE_VERSION = 3;

type LegacyVersion = 1 | 2;
const LEGACY_VERSIONS: LegacyVersion[] = [1, 2];

// Opens the same-named database the way the released app at `fromVersion` did,
// hands it to `seed`, and closes it so the production instance can upgrade it.
async function withLegacyDb(
  fromVersion: LegacyVersion,
  seed: (legacy: Dexie) => Promise<void>,
): Promise<void> {
  const legacy = new Dexie('interviewer');
  legacy.version(1).stores(V1_STORES);
  if (fromVersion >= 2) legacy.version(2).stores(V2_SESSIONS_STORES);
  await legacy.open();
  // Dexie maps a declared version onto the native IndexedDB version by
  // multiplying by 10. The e2e upgrade spec (e2e/specs/db-upgrade.spec.ts)
  // seeds a legacy database through these same declarations and asserts the
  // native version afterwards, so pin the mapping where it's cheap to see.
  expect(legacy.backendDB().version).toBe(fromVersion * 10);
  try {
    await seed(legacy);
  } finally {
    legacy.close();
  }
}

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function protocolDocument(name: string): CurrentProtocol {
  return migrateProtocol(
    {
      schemaVersion: 7,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            iconVariant: 'add-a-person',
            displayVariable: 'name',
            // Vary the variable name per protocol (valid-token characters
            // only) so the two seeded protocols hash differently.
            variables: {
              name: {
                name: `Name.${name.replace(/\s+/g, '.')}`,
                type: 'text',
              },
            },
          },
        },
        edge: {},
        ego: {},
      },
      stages: [],
    },
    COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    { name },
  );
}

function storedProtocol(name: string): StoredProtocol {
  const document = protocolDocument(name);
  const hash = hashProtocol(document);
  return {
    id: hash,
    hash,
    name,
    schemaVersion: document.schemaVersion,
    importedAt: '2026-01-01T00:00:00.000Z',
    description: `${name} description`,
    codebook: document.codebook,
    protocol: document,
  };
}

const network: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'ego',
    [entityAttributesProperty]: { mood: 7 },
  },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: 'Alex' },
    },
    {
      [entityPrimaryKeyProperty]: 'n2',
      type: 'person',
      [entityAttributesProperty]: { name: 'Sam' },
    },
  ],
  edges: [
    {
      [entityPrimaryKeyProperty]: 'e1',
      type: 'knows',
      from: 'n1',
      to: 'n2',
      [entityAttributesProperty]: {},
    },
  ],
};

function completeSession(protocol: StoredProtocol): StoredSession {
  return {
    id: 'session-complete',
    protocolHash: protocol.hash,
    protocolName: protocol.name,
    caseId: 'case-complete',
    startedAt: '2026-01-05T10:00:00.000Z',
    lastUpdatedAt: '2026-01-05T11:00:00.000Z',
    finishedAt: '2026-01-05T11:00:00.000Z',
    exportedAt: '2026-01-06T09:00:00.000Z',
    currentStep: 4,
    progress: 100,
    network,
  };
}

// Deliberately omits `progress` — a row written before the field existed —
// and carries the resume-relevant optional fields.
function inProgressSession(protocol: StoredProtocol): StoredSession {
  return {
    id: 'session-in-progress',
    protocolHash: protocol.hash,
    protocolName: protocol.name,
    caseId: 'case-in-progress',
    startedAt: '2026-01-07T10:00:00.000Z',
    lastUpdatedAt: '2026-01-07T10:30:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 2,
    resumeStageOverrideIndex: 1,
    network,
    stageMetadata: { '0': { automaticLayout: true } },
  };
}

// Only seedable at v2+: the field rode in with the version(2) index.
function syntheticSession(protocol: StoredProtocol, id: string): StoredSession {
  return {
    id,
    protocolHash: protocol.hash,
    protocolName: protocol.name,
    caseId: `case-${id}`,
    startedAt: '2026-01-08T10:00:00.000Z',
    lastUpdatedAt: '2026-01-08T10:00:00.000Z',
    finishedAt: '2026-01-08T10:00:00.000Z',
    exportedAt: null,
    currentStep: 4,
    progress: 100,
    isSynthetic: true,
    network,
  };
}

function apiKeyAsset(protocol: StoredProtocol): StoredAsset {
  return {
    id: `${protocol.hash}::asset-key`,
    protocolHash: protocol.hash,
    assetId: 'asset-key',
    name: 'Map key',
    type: 'apikey',
    data: 'secret-token',
  };
}

// Seedable only in the encrypted variant: its ciphertext is plain strings,
// which jsdom's fake-indexeddb round-trips faithfully. A PLAINTEXT Blob loses
// its prototype in that same round-trip (see reencrypt.test.ts), so plaintext
// Blob survival is covered by the e2e upgrade spec in a real browser instead.
function imageAsset(protocol: StoredProtocol): StoredAsset {
  return {
    id: `${protocol.hash}::asset-image`,
    protocolHash: protocol.hash,
    assetId: 'asset-image',
    name: 'Background',
    type: 'image',
    data: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10])], {
      type: 'image/png',
    }),
  };
}

// A settings row as an older release wrote it: real values for the fields
// that existed, none of the later-added flags.
const legacySettingsRow: Record<string, unknown> = {
  id: 'device',
  exportGraphML: false,
  exportCSV: true,
  useScreenLayoutCoordinates: true,
  screenLayoutHeight: 768,
  screenLayoutWidth: 1024,
  dismissedUpdates: ['1.0.1'],
  idleTimeoutMinutes: 5,
  requireUnlockOnEnter: false,
  sampleProtocolDismissed: true,
};

type Seeded = {
  protocols: StoredProtocol[];
  sessions: StoredSession[];
  assets: StoredAsset[];
  protocolRows: StoredProtocolRow[];
  sessionRows: StoredSessionRow[];
  assetRows: StoredAssetRow[];
};

async function seedLegacyDatabase(
  fromVersion: LegacyVersion,
  encrypted: boolean,
): Promise<Seeded> {
  const alpha = storedProtocol('Alpha Study');
  // No sessions or assets reference Beta — an idle protocol must survive too.
  const beta = storedProtocol('Beta Study');
  const protocols = [alpha, beta];
  const sessions = [completeSession(alpha), inProgressSession(alpha)];
  if (fromVersion >= 2) sessions.push(syntheticSession(alpha, 'session-syn'));
  const assets = [apiKeyAsset(alpha)];
  if (encrypted) assets.push(imageAsset(alpha));

  // Encode through the real per-row codecs — they pass plaintext through when
  // no DEK is set (mode 'none') and produce genuine ciphertext when one is.
  const protocolRows = await Promise.all(protocols.map(encryptProtocol));
  const sessionRows = await Promise.all(sessions.map(encryptSession));
  const assetRows = await Promise.all(assets.map(encryptAsset));

  await withLegacyDb(fromVersion, async (legacy) => {
    await legacy
      .table<StoredProtocolRow, string>('protocols')
      .bulkPut(protocolRows);
    await legacy
      .table<StoredSessionRow, string>('sessions')
      .bulkPut(sessionRows);
    await legacy.table<StoredAssetRow, string>('assets').bulkPut(assetRows);
    await legacy
      .table<Record<string, unknown>, string>('settings')
      .put(legacySettingsRow);
  });

  return { protocols, sessions, assets, protocolRows, sessionRows, assetRows };
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

async function resetDatabase(): Promise<void> {
  db.close();
  await Dexie.delete('interviewer');
}

describe.each([
  ['plaintext (mode none)', false],
  ['encrypted at rest (enrolled mode, vault unlocked)', true],
])(
  'opening a legacy database with the current schema — %s',
  (_label, encrypted) => {
    describe.each(LEGACY_VERSIONS)(
      'seeded at Dexie schema v%i',
      (fromVersion) => {
        beforeEach(async () => {
          await resetDatabase();
          setSessionDek(encrypted ? await makeDek() : null);
        });
        afterEach(async () => {
          await resetDatabase();
          setSessionDek(null);
        });

        it('upgrades in place and preserves every row through the production read path', async () => {
          const seeded = await seedLegacyDatabase(fromVersion, encrypted);

          await db.open();

          // The upgrade actually ran on the seeded database: same name, now at
          // the current declared version. A rename or renumber would instead open
          // a fresh empty database and fail the row assertions below.
          expect(db.name).toBe('interviewer');
          expect(db.verno).toBe(CURRENT_DEXIE_VERSION);
          const native = db.backendDB();
          expect(native.version).toBe(CURRENT_DEXIE_VERSION * 10);
          expect(Array.from(native.objectStoreNames).toSorted()).toEqual([
            'assets',
            'protocolMigrations',
            'protocols',
            'sessions',
            'settings',
          ]);
          // The v2 index exists in the INSTALLED schema (not merely the declared
          // one), whichever version the database started at.
          const sessionStore = native
            .transaction('sessions', 'readonly')
            .objectStore('sessions');
          expect(Array.from(sessionStore.indexNames)).toContain('isSynthetic');

          // Every row survives byte-for-byte — encrypted rows keep their exact
          // ciphertext, plaintext rows their exact fields.
          expect((await db.protocols.toArray()).toSorted(byId)).toEqual(
            [...seeded.protocolRows].toSorted(byId),
          );
          expect((await db.sessions.toArray()).toSorted(byId)).toEqual(
            [...seeded.sessionRows].toSorted(byId),
          );
          expect((await db.assets.toArray()).toSorted(byId)).toEqual(
            [...seeded.assetRows].toSorted(byId),
          );

          // And every row still decodes to the exact domain object it was written
          // from — for encrypted rows this also proves the AAD-bound ids/hashes
          // were not rewritten by the upgrade.
          for (const expected of seeded.protocols) {
            const row = await db.protocols.get(expected.id);
            if (!row) throw new Error(`protocol ${expected.name} missing`);
            expect(await decryptProtocol(row)).toEqual(expected);
          }
          for (const expected of seeded.sessions) {
            const row = await db.sessions.get(expected.id);
            if (!row) throw new Error(`session ${expected.id} missing`);
            expect(await decryptSession(row)).toEqual(expected);
          }
          for (const expected of seeded.assets) {
            const row = await db.assets.get(expected.id);
            if (!row) throw new Error(`asset ${expected.id} missing`);
            expect(await decryptAsset(row)).toEqual(expected);
          }

          // Sessions are still reachable through a v1-era index after the upgrade.
          const alphaHash = seeded.sessions[0]?.protocolHash;
          if (!alphaHash) throw new Error('expected a seeded session');
          expect(
            await db.sessions.where('protocolHash').equals(alphaHash).count(),
          ).toBe(seeded.sessions.length);

          // The device settings row survives, and the production read fills the
          // later-added flags with defaults without clobbering stored values.
          expect(await getSettings()).toEqual({
            ...DEFAULT_SETTINGS,
            ...legacySettingsRow,
          });
        });

        it('keeps synthetic-session bookkeeping working over the upgraded database', async () => {
          await seedLegacyDatabase(fromVersion, encrypted);
          await db.open();

          // v1 rows predate the field entirely; the v2 seed includes one
          // synthetic row that must still be recognised after the upgrade.
          const legacySyntheticCount = fromVersion >= 2 ? 1 : 0;
          expect(await countSyntheticSessions()).toBe(legacySyntheticCount);

          // New synthetic rows written after the upgrade land in the same store
          // and are counted alongside any legacy ones…
          const alpha = storedProtocol('Alpha Study');
          await db.sessions.put(
            await encryptSession(syntheticSession(alpha, 'session-syn-new')),
          );
          expect(await countSyntheticSessions()).toBe(legacySyntheticCount + 1);

          // …and bulk-deleting synthetic data leaves the real legacy sessions
          // untouched.
          expect(await deleteSyntheticSessions()).toBe(
            legacySyntheticCount + 1,
          );
          expect(await countSyntheticSessions()).toBe(0);
          expect(await db.sessions.orderBy('id').primaryKeys()).toEqual([
            'session-complete',
            'session-in-progress',
          ]);
        });

        it('creates the protocolMigrations store and the launch sweep runs cleanly', async () => {
          const seeded = await seedLegacyDatabase(fromVersion, encrypted);
          await db.open();

          // The boot-time sweep must not touch protocols already at the
          // compatible schema version, whatever Dexie version their rows were
          // written under.
          await expect(migrateStoredProtocols()).resolves.toEqual({
            migrated: [],
            failed: [],
          });
          expect((await db.protocols.toArray()).toSorted(byId)).toEqual(
            [...seeded.protocolRows].toSorted(byId),
          );

          // The store added by version(3) exists and holds re-keying records —
          // if the upgrade had failed to create it, this put would throw.
          const record = {
            previousHash: 'superseded-hash',
            hash: 'live-hash',
            migratedAt: '2026-02-01T00:00:00.000Z',
          };
          await db.protocolMigrations.put(record);
          expect(await db.protocolMigrations.get('superseded-hash')).toEqual(
            record,
          );
        });
      },
    );
  },
);
