// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StageMetadataSchema } from '@codaco/shared-consts';
import {
  FROZEN_PROTOCOL_PLAINTEXT,
  FROZEN_ROWS,
  importFrozenDek,
  interviewer8DecryptAsset,
  interviewer8DecryptProtocol,
  interviewer8DecryptSession,
  readRawRows,
  seedAsInterviewer8,
} from '~/testUtils/interviewer8Database';

import { fromBase64 } from '../../vault/crypto';
import { db } from '../db';
import {
  getProtocolAssets,
  getProtocolByHash,
  saveProtocol,
} from '../protocols';
import { reencryptAllRecords } from '../reencrypt';
import { setSessionDek } from '../sessionKey';
import {
  createSession,
  getSessionsForExport,
  markSessionUnfinished,
  markSessionsExported,
} from '../sessions';
import type { Schema8Protocol } from '../types';
import fixture from './fixtures/interviewer8-record-crypto.json';

// THE CONTRACT WITH INTERVIEWER 8: every row this app writes for a schema 8
// protocol, its assets and its interviews is exactly the row Interviewer 8
// writes, so Interviewer 8 at /v8/ reads it as its own.
//
// The fixture was made by running Interviewer 8's own codec (main's
// `lib/db/recordCrypto.ts`) on the plaintext rows it holds, under its key.
// Never regenerate it to make a failure pass: it is what a device running
// Interviewer 8 holds. Rows written here are read back raw and decrypted with
// the frozen copy of Interviewer 8's decoders in `testUtils`.

type Row = Record<string, unknown>;
type Field = { iv: string; ct: string; kind?: string; mime?: string };

const importFixtureDek = () =>
  crypto.subtle.importKey('raw', fromBase64(fixture.dekB64), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);

const encOf = (row: Row) => (row._enc ?? {}) as Record<string, Field>;

/**
 * A row's layout: its keys, and each encrypted field's keys and labels. A key
 * holding `undefined` is left out: Interviewer 8 writes some (an absent
 * `lastModified`), and the fixture, made through JSON, cannot hold them.
 */
const layoutOf = (row: Row) => ({
  keys: Object.keys(row)
    .filter((key) => row[key] !== undefined)
    .toSorted(),
  enc: Object.fromEntries(
    Object.entries(encOf(row)).map(([name, field]) => [
      name,
      {
        keys: Object.keys(field).toSorted(),
        kind: field.kind,
        mime: field.mime,
        ivBytes: fromBase64(field.iv).length,
      },
    ]),
  ),
});

const rawRow = async (table: string, key: string): Promise<Row> => {
  const rows = (await readRawRows(table)) as Row[];
  const row = rows.find((candidate) => candidate.id === key);
  if (!row) throw new Error(`No ${table} row ${key}`);
  return row;
};

const blobBytes = async (value: unknown) => {
  if (!(value instanceof Blob)) throw new Error('expected a Blob');
  return Array.from(new Uint8Array(await value.arrayBuffer()));
};

// The schema 8 document of the fixture, with a manifest naming its two assets
// so their types come from it, as they do on import.
const schema8Document = {
  ...fixture.plaintext.protocol.protocol,
  assetManifest: {
    key: { id: 'key', type: 'apikey', name: 'Map key', value: 'k' },
    image: { id: 'image', type: 'image', name: 'Background', source: 'b.png' },
  },
} as Schema8Protocol;

const fixtureAssets = () => [
  { id: 'key', name: 'Map key', data: fixture.plaintext.stringAsset.data },
  {
    id: 'image',
    name: 'Background',
    data: new Blob([new Uint8Array(fixture.plaintext.blobAsset.data.bytes)], {
      type: fixture.plaintext.blobAsset.data.mime,
    }),
  },
];

// Interviewer 8's `createSession` (main) writes exactly these fields, and
// encrypts `network` (and `stageMetadata`, once there is some) into `_enc`.
const INTERVIEWER_8_NEW_SESSION_KEYS = [
  '_enc',
  'caseId',
  'currentStep',
  'exportedAt',
  'finishedAt',
  'id',
  'isSynthetic',
  'lastUpdatedAt',
  'protocolHash',
  'protocolName',
  'startedAt',
];

// Stage metadata Interviewer 8's family pedigree writes. This app's own
// stage-metadata schema refuses it, so reading it with that schema would
// lose a schema 8 interview's answers.
const interviewer8Metadata = {
  pedigree: {
    edgeIdVersion: 1,
    noChildrenAffirmed: true,
    nodes: [{ id: 'n-1', label: 'Ada', isEgo: true }],
  },
};

const reset = async () => {
  setSessionDek(null);
  db.close();
  await db.delete({ disableAutoOpen: false });
};

beforeEach(reset);
afterEach(reset);

describe("main's Interviewer 8 fixture", () => {
  it("decrypts with the frozen copy of Interviewer 8's decoders", async () => {
    const key = await importFixtureDek();
    const { plaintext, encrypted } = fixture;
    expect(
      await interviewer8DecryptSession(encrypted.sessionWithMetadata, key),
    ).toEqual(plaintext.sessionWithMetadata);
    expect(await interviewer8DecryptProtocol(encrypted.protocol, key)).toEqual(
      plaintext.protocol,
    );
    expect(
      (await interviewer8DecryptAsset(encrypted.stringAsset, key)).data,
    ).toBe(plaintext.stringAsset.data);
    expect(
      await blobBytes(
        (await interviewer8DecryptAsset(encrypted.blobAsset, key)).data,
      ),
    ).toEqual(plaintext.blobAsset.data.bytes);
  });
});

describe('a schema 8 protocol Interviewer 8 encrypted', () => {
  it('is read here, assets included, with the shared key', async () => {
    await seedAsInterviewer8({
      protocols: [FROZEN_ROWS.protocol],
      assets: [FROZEN_ROWS.apiKeyAsset, FROZEN_ROWS.imageAsset],
    });
    setSessionDek(await importFrozenDek());

    expect(await getProtocolByHash('frozen-hash')).toEqual({
      id: 'frozen-hash',
      hash: 'frozen-hash',
      name: 'Frozen Study',
      schemaVersion: 8,
      importedAt: '2026-01-01T00:00:00.000Z',
      protocol: FROZEN_PROTOCOL_PLAINTEXT,
      codebook: FROZEN_PROTOCOL_PLAINTEXT.codebook,
    });
    const assets = await getProtocolAssets('frozen-hash');
    const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
    expect(byId.get('frozen-key')?.data).toBe('frozen-secret');
    const image = byId.get('frozen-image')?.data;
    expect(image instanceof Blob ? image.type : undefined).toBe('image/png');
    expect(await blobBytes(image)).toEqual([137, 80, 78, 71, 13, 10]);
  });
});

describe('a schema 8 protocol saved by this app', () => {
  it("is Interviewer 8's encrypted protocol and asset rows", async () => {
    const key = await importFixtureDek();
    setSessionDek(key);
    await saveProtocol(schema8Document, 'fixture-hash', fixtureAssets());

    const protocol = await rawRow('protocols', 'fixture-hash');
    expect(layoutOf(protocol)).toEqual(layoutOf(fixture.encrypted.protocol));
    const { importedAt, ...decrypted } = await interviewer8DecryptProtocol(
      protocol,
      key,
    );
    expect(typeof importedAt).toBe('string');
    const { importedAt: _fixtureImportedAt, ...expected } =
      fixture.plaintext.protocol;
    expect(decrypted).toEqual({ ...expected, protocol: schema8Document });

    const stringAsset = await rawRow('assets', 'fixture-hash::key');
    expect(layoutOf(stringAsset)).toEqual(
      layoutOf(fixture.encrypted.stringAsset),
    );
    expect(await interviewer8DecryptAsset(stringAsset, key)).toEqual(
      fixture.plaintext.stringAsset,
    );

    const blobAsset = await rawRow('assets', 'fixture-hash::image');
    expect(layoutOf(blobAsset)).toEqual(layoutOf(fixture.encrypted.blobAsset));
    const { data, ...blobFields } = await interviewer8DecryptAsset(
      blobAsset,
      key,
    );
    const { data: fixtureData, ...fixtureBlobFields } =
      fixture.plaintext.blobAsset;
    expect(blobFields).toEqual(fixtureBlobFields);
    expect(await blobBytes(data)).toEqual(fixtureData.bytes);
  });

  it("is Interviewer 8's plaintext rows on a device without a lock", async () => {
    await saveProtocol(schema8Document, 'fixture-hash', fixtureAssets());

    const { importedAt: _importedAt, ...protocol } = await rawRow(
      'protocols',
      'fixture-hash',
    );
    const { importedAt: _fixtureImportedAt, ...expected } =
      fixture.plaintext.protocol;
    expect(protocol).toEqual({ ...expected, protocol: schema8Document });
    expect(await rawRow('assets', 'fixture-hash::key')).toEqual(
      fixture.plaintext.stringAsset,
    );
  });
});

describe('a schema 8 interview written by this app', () => {
  beforeEach(async () => {
    // The string asset only: the test IndexedDB cannot store a Blob that is
    // still plaintext, which the lock's sweep below would read back.
    await saveProtocol(schema8Document, 'fixture-hash', [
      { id: 'key', name: 'Map key', data: fixture.plaintext.stringAsset.data },
    ]);
  });

  it("starts as Interviewer 8's new session row", async () => {
    const key = await importFixtureDek();
    setSessionDek(key);
    const network = fixture.plaintext.sessionWithoutMetadata.network;
    const created = await createSession({
      protocolHash: 'fixture-hash',
      protocolName: 'Fixture Study',
      caseId: 'case-new',
      initialNetwork: network,
    });

    const row = await rawRow('sessions', created.id);
    expect(Object.keys(row).toSorted()).toEqual(INTERVIEWER_8_NEW_SESSION_KEYS);
    expect(layoutOf(row).enc).toEqual(
      layoutOf(fixture.encrypted.sessionWithoutMetadata).enc,
    );
    expect(await interviewer8DecryptSession(row, key)).toEqual({
      id: created.id,
      protocolHash: 'fixture-hash',
      protocolName: 'Fixture Study',
      caseId: 'case-new',
      startedAt: created.startedAt,
      lastUpdatedAt: created.startedAt,
      finishedAt: null,
      exportedAt: null,
      currentStep: 0,
      isSynthetic: false,
      network,
      stageMetadata: undefined,
    });
  });

  it('is marked exported with only the fields Interviewer 8 changes', async () => {
    const key = await importFixtureDek();
    setSessionDek(key);
    await seedAsInterviewer8({
      sessions: [fixture.encrypted.sessionWithMetadata],
    });
    const before = await rawRow('sessions', 'session-a');

    await markSessionsExported(['session-a']);

    const { exportedAt, lastUpdatedAt, ...after } = await rawRow(
      'sessions',
      'session-a',
    );
    const {
      exportedAt: _before,
      lastUpdatedAt: _beforeUpdated,
      ...unchanged
    } = before;
    // The answers stay byte for byte as Interviewer 8 encrypted them.
    expect(after).toEqual(unchanged);
    expect(typeof exportedAt).toBe('string');
    expect(lastUpdatedAt).toBe(exportedAt);
  });

  it('is exported without reading its stage metadata with this app’s schema', async () => {
    expect(StageMetadataSchema.safeParse(interviewer8Metadata).success).toBe(
      false,
    );
    const key = await importFixtureDek();
    setSessionDek(key);
    const { network } = fixture.plaintext.sessionWithMetadata;
    await seedAsInterviewer8({
      sessions: [
        {
          ...fixture.plaintext.sessionWithMetadata,
          stageMetadata: interviewer8Metadata,
        },
      ],
    });
    await reencryptAllRecords();

    const [exported] = await getSessionsForExport(['session-a']);
    expect(exported?.network).toEqual(network);
  });

  it("is re-encrypted by the lock's sweep as Interviewer 8's row, unchanged", async () => {
    const key = await importFixtureDek();
    setSessionDek(key);
    // An unfinished interview Interviewer 8 wrote while there was no lock,
    // its stage metadata in Interviewer 8's own shape.
    const unfinished = {
      ...fixture.plaintext.sessionWithMetadata,
      stageMetadata: interviewer8Metadata,
    };
    await seedAsInterviewer8({
      sessions: [unfinished, fixture.plaintext.sessionWithoutMetadata],
    });

    expect((await reencryptAllRecords()).failed).toBe(0);

    const row = await rawRow('sessions', 'session-a');
    expect(layoutOf(row)).toEqual(
      layoutOf(fixture.encrypted.sessionWithMetadata),
    );
    expect(await interviewer8DecryptSession(row, key)).toEqual(unfinished);

    const finished = await rawRow('sessions', 'session-b');
    expect(layoutOf(finished)).toEqual(
      layoutOf(fixture.encrypted.sessionWithoutMetadata),
    );
    expect(await interviewer8DecryptSession(finished, key)).toEqual(
      fixture.plaintext.sessionWithoutMetadata,
    );

    // And the protocol and asset rows saved without a lock.
    expect(layoutOf(await rawRow('protocols', 'fixture-hash'))).toEqual(
      layoutOf(fixture.encrypted.protocol),
    );
    expect(layoutOf(await rawRow('assets', 'fixture-hash::key'))).toEqual(
      layoutOf(fixture.encrypted.stringAsset),
    );
  });

  it('is never marked unfinished here, and is left as it was', async () => {
    const key = await importFixtureDek();
    setSessionDek(key);
    await seedAsInterviewer8({
      sessions: [fixture.encrypted.sessionWithoutMetadata],
    });
    const before = await rawRow('sessions', 'session-b');

    await expect(markSessionUnfinished('session-b', [])).rejects.toThrow(
      /not at schema 9/,
    );
    expect(await rawRow('sessions', 'session-b')).toEqual(before);
  });
});
