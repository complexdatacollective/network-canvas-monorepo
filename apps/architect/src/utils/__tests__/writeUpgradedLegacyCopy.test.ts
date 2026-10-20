// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';

import { assetDb } from '../assetDB';
import type { LegacyProtocolSnapshot } from '../legacyProtocolLibrary';
import {
  listLegacyProtocolChoices,
  recordLegacyProtocolKept,
  writeUpgradedLegacyCopy,
} from '../protocolLibrary';

vi.mock('../reportError', () => ({ reportError: vi.fn() }));

// jsdom's Blob cannot cross fake-indexeddb's structured clone; Node's can.
const makeBlob = (text: string) => new NodeBlob([text]) as unknown as Blob;

const upgraded: CurrentProtocol = {
  name: 'Older study',
  description: 'Upgraded description',
  schemaVersion: APP_SCHEMA_VERSION,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [],
  codebook: {},
};

const snapshot: LegacyProtocolSnapshot = {
  row: {
    id: 'legacy-1',
    name: 'Older study',
    description: 'From Architect 8',
    schemaVersion: 8,
    protocol: { schemaVersion: 8, codebook: {}, stages: [] },
    validated: true,
    sourceRef: { kind: 'template', id: 'sample' },
    createdAt: 1,
    updatedAt: 2,
  },
  assets: [
    {
      id: 'legacy-1::a1',
      assetId: 'a1',
      protocolId: 'legacy-1',
      name: 'map.png',
      data: makeBlob('map bytes'),
    },
    {
      id: 'legacy-1::a2',
      assetId: 'a2',
      protocolId: 'legacy-1',
      name: 'roster.csv',
      data: makeBlob('roster bytes'),
    },
  ],
};

const readLibrary = async () => ({
  protocols: await assetDb.protocols.toArray(),
  assets: await assetDb.assets.toArray(),
  choices: await assetDb.legacyProtocolChoices.toArray(),
});

afterEach(async () => {
  await Promise.all([
    assetDb.protocols.clear(),
    assetDb.assets.clear(),
    assetDb.legacyProtocolChoices.clear(),
  ]);
});

describe('writeUpgradedLegacyCopy', () => {
  it('writes the copy, its re-keyed assets and the choice together', async () => {
    const result = await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'copy-1',
      now: 1000,
    });

    expect(result).toEqual({ protocolId: 'copy-1', created: true });
    const { protocols, assets, choices } = await readLibrary();
    expect(protocols).toEqual([
      {
        id: 'copy-1',
        name: 'Older study',
        description: 'Upgraded description',
        schemaVersion: APP_SCHEMA_VERSION,
        protocol: upgraded,
        validated: true,
        sourceRef: { kind: 'template', id: 'sample' },
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);
    expect(
      assets.map(({ id, assetId, protocolId, name }) => ({
        id,
        assetId,
        protocolId,
        name,
      })),
    ).toEqual([
      {
        id: 'copy-1::a1',
        assetId: 'a1',
        protocolId: 'copy-1',
        name: 'map.png',
      },
      {
        id: 'copy-1::a2',
        assetId: 'a2',
        protocolId: 'copy-1',
        name: 'roster.csv',
      },
    ]);
    const [firstAsset] = assets;
    if (!firstAsset || typeof firstAsset.data === 'string') {
      throw new Error('The copy’s first asset should be a stored file');
    }
    expect(await firstAsset.data.text()).toBe('map bytes');
    expect(choices).toEqual([
      {
        legacyId: 'legacy-1',
        choice: 'upgraded',
        upgradedId: 'copy-1',
        updatedAt: 1000,
      },
    ]);
  });

  it('keeps the copy another tab made while this one was migrating', async () => {
    await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'other-tab-copy',
    });

    // This tab read no choice before it began migrating.
    const result = await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'duplicate',
    });

    expect(result).toEqual({ protocolId: 'other-tab-copy', created: false });
    const { protocols, assets } = await readLibrary();
    expect(protocols.map((row) => row.id)).toEqual(['other-tab-copy']);
    expect(assets.every((asset) => asset.protocolId === 'other-tab-copy')).toBe(
      true,
    );
  });

  // The researcher already had a copy and asked for another: Architect 8 may
  // hold newer work than that copy does.
  it('makes a fresh copy when the earlier one was there before it began', async () => {
    await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'first-copy',
    });

    const result = await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: 'first-copy',
      createId: () => 'second-copy',
      now: 2000,
    });

    expect(result).toEqual({ protocolId: 'second-copy', created: true });
    const { protocols, choices } = await readLibrary();
    expect(protocols.map((row) => row.id).toSorted()).toEqual([
      'first-copy',
      'second-copy',
    ]);
    expect(choices).toEqual([
      {
        legacyId: 'legacy-1',
        choice: 'upgraded',
        upgradedId: 'second-copy',
        updatedAt: 2000,
      },
    ]);
  });

  it('makes a new copy when the one a choice names has been deleted', async () => {
    await assetDb.legacyProtocolChoices.put({
      legacyId: 'legacy-1',
      choice: 'upgraded',
      upgradedId: 'deleted-copy',
      updatedAt: 1,
    });

    const result = await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'replacement',
    });

    expect(result).toEqual({ protocolId: 'replacement', created: true });
  });

  it('replaces a choice to keep it in Architect 8', async () => {
    await assetDb.legacyProtocolChoices.put({
      legacyId: 'legacy-1',
      choice: 'legacy',
      updatedAt: 1,
    });

    await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'copy-1',
      now: 3000,
    });

    expect((await readLibrary()).choices).toEqual([
      {
        legacyId: 'legacy-1',
        choice: 'upgraded',
        upgradedId: 'copy-1',
        updatedAt: 3000,
      },
    ]);
  });

  it('writes nothing at all when any part of the copy fails', async () => {
    // An asset row already sits where the copy's first asset must go.
    await assetDb.assets.put({
      id: 'copy-1::a1',
      assetId: 'a1',
      protocolId: 'copy-1',
      name: 'squatter.png',
      data: makeBlob('squatter'),
    });

    await expect(
      writeUpgradedLegacyCopy({
        snapshot,
        protocol: upgraded,
        upgradedIdBefore: undefined,
        createId: () => 'copy-1',
      }),
    ).rejects.toThrow();

    const { protocols, assets, choices } = await readLibrary();
    expect(protocols).toEqual([]);
    expect(assets.map((asset) => asset.name)).toEqual(['squatter.png']);
    expect(choices).toEqual([]);
  });
});

describe('recordLegacyProtocolKept', () => {
  it('remembers the protocol stays in Architect 8', async () => {
    await recordLegacyProtocolKept('legacy-1', 500);

    expect(await listLegacyProtocolChoices()).toEqual([
      {
        legacyId: 'legacy-1',
        choice: 'legacy',
        upgradedId: undefined,
        updatedAt: 500,
      },
    ]);
  });

  it('keeps the record of a copy upgraded earlier', async () => {
    await writeUpgradedLegacyCopy({
      snapshot,
      protocol: upgraded,
      upgradedIdBefore: undefined,
      createId: () => 'copy-1',
      now: 1000,
    });

    await recordLegacyProtocolKept('legacy-1', 2000);

    expect(await listLegacyProtocolChoices()).toEqual([
      {
        legacyId: 'legacy-1',
        choice: 'legacy',
        upgradedId: 'copy-1',
        updatedAt: 2000,
      },
    ]);
    // Only the choice changed: the copy itself is untouched.
    expect((await readLibrary()).protocols.map(({ id }) => id)).toEqual([
      'copy-1',
    ]);
  });
});
