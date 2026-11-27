import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { generateNetwork } from '@codaco/protocol-utilities';
import developmentProtocol from '@codaco/protocols/development';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { StoredAsset, StoredCurrentProtocol } from '../../db/types';

const getProtocolAssets = vi.fn();

vi.mock('../../db/api', () => ({
  getProtocolAssets: (...args: unknown[]) => getProtocolAssets(...args),
}));

const { loadRosterNodesForStages } = await import('../loadRosterData');

const ASSET_DIR = resolve(
  import.meta.dirname,
  '../../../../../../packages/protocols/development/assets/',
);

const HASH = 'development-hash';

type DevelopmentStage = (typeof developmentProtocol.stages)[number];

// Stage ids are UUIDs, so each stage is found by what it is: its type, its
// English label and, for the two Classmates rosters, the option only one has.
const stageIdWhere = (
  description: string,
  matches: (stage: DevelopmentStage) => boolean,
): string => {
  const found = developmentProtocol.stages.filter(matches);
  const [stage] = found;
  if (!stage || found.length > 1) {
    throw new Error(`The Development Protocol has no single ${description}`);
  }
  return stage.id;
};

const labelled =
  (type: string, label: string) =>
  (stage: DevelopmentStage): boolean =>
    stage.type === type && stage.label.en === label;

const nodeTypeNamed = (name: string) => {
  const found = Object.entries(developmentProtocol.codebook.node ?? {}).find(
    ([, type]) => type.name === name,
  );
  if (found === undefined) {
    throw new Error(`the development protocol has no node type named ${name}`);
  }
  return found;
};

const externalDataNameGenerator = stageIdWhere(
  'name generator with external data',
  labelled('NameGenerator', 'NG with external data'),
);
const csvNameGenerator = stageIdWhere(
  'name generator with a CSV file',
  labelled('NameGenerator', 'NG CSV File'),
);
const searchableClassmatesRoster = stageIdWhere(
  'searchable Classmates roster',
  (stage) =>
    labelled('NameGeneratorRoster', 'NG Classmates')(stage) &&
    'searchOptions' in stage,
);
const sortableClassmatesRoster = stageIdWhere(
  'sortable Classmates roster',
  (stage) =>
    labelled('NameGeneratorRoster', 'NG Classmates')(stage) &&
    'sortOptions' in stage,
);
const hivServicesRoster = stageIdWhere(
  'HIV services roster',
  labelled('NameGeneratorRoster', 'NG HIV Services'),
);
const hivAutocompleteRoster = stageIdWhere(
  'HIV autocomplete roster',
  labelled('NameGeneratorRoster', 'Roster Autocomplete HIV'),
);

const bytesByUrl = new Map<string, Buffer>();

function storedProtocol(): StoredCurrentProtocol {
  return {
    id: HASH,
    hash: HASH,
    name: 'Development Protocol',
    schemaVersion: 9,
    importedAt: new Date().toISOString(),
    codebook: developmentProtocol.codebook,
    protocol: developmentProtocol,
  } as unknown as StoredCurrentProtocol;
}

beforeAll(() => {
  const manifest = developmentProtocol.assetManifest ?? {};
  const assets: StoredAsset[] = [];

  for (const [assetId, entry] of Object.entries(manifest)) {
    if (entry.type !== 'network' || !('source' in entry)) continue;
    const bytes = readFileSync(resolve(ASSET_DIR, entry.source));
    const url = `blob:${assetId}`;
    bytesByUrl.set(url, bytes);
    assets.push({
      id: `${HASH}::${assetId}`,
      protocolHash: HASH,
      assetId,
      name: entry.name,
      type: 'network',
      data: new Blob([new Uint8Array(bytes)]),
    });
  }

  const urlByBlob = new Map<unknown, string>();
  assets.forEach((a, i) => urlByBlob.set(a.data, [...bytesByUrl.keys()][i]!));

  // Subclass rather than spread so URL stays constructible (jsdom builds
  // `new URL(...)` internally); vi.unstubAllGlobals then restores it.
  class StubURL extends URL {}
  vi.stubGlobal(
    'URL',
    Object.assign(StubURL, {
      createObjectURL: (blob: unknown) => urlByBlob.get(blob) ?? 'blob:unknown',
      revokeObjectURL: () => undefined,
    }),
  );
  vi.stubGlobal('fetch', (url: string) => {
    const bytes = bytesByUrl.get(url);
    if (!bytes) return Promise.reject(new Error(`No bytes for ${url}`));
    return Promise.resolve(new Response(bytes.toString('utf8')));
  });

  getProtocolAssets.mockResolvedValue(assets);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('synthetic generation over the real Development Protocol', () => {
  it('parses every roster-backed stage from the real asset files', async () => {
    const externalData = await loadRosterNodesForStages(storedProtocol());

    expect(Object.keys(externalData).toSorted()).toEqual(
      [
        externalDataNameGenerator,
        csvNameGenerator,
        searchableClassmatesRoster,
        sortableClassmatesRoster,
        hivServicesRoster,
        hivAutocompleteRoster,
      ].toSorted(),
    );

    expect(externalData[searchableClassmatesRoster]).toHaveLength(6);
    expect(externalData[hivServicesRoster]!.length).toBeGreaterThan(200);

    expect(externalData[externalDataNameGenerator]).toHaveLength(1);
  });

  it('maps roster columns onto real codebook variable ids', async () => {
    const externalData = await loadRosterNodesForStages(storedProtocol());

    const [personTypeId, personType] = nodeTypeNamed('person');
    const person = externalData[searchableClassmatesRoster]![0]!;
    expect(person.type).toBe(personTypeId);

    const nameVariable = Object.entries(personType.variables!).find(
      ([, v]) => v.name === 'nickname',
    )![0];

    const attributes = person[entityAttributesProperty];
    expect(Object.keys(attributes)).toContain(nameVariable);
  });

  it('builds a network whose roster people come from the real rosters', async () => {
    const protocol = storedProtocol();
    const externalData = await loadRosterNodesForStages(protocol);

    const { network } = generateNetwork({
      codebook: protocol.codebook,
      stages: protocol.protocol.stages,
      formLanguage: protocol.protocol.localization.defaultLocale,
      localization: protocol.protocol.localization,
      seed: 42,
      externalData,
    });

    const rosterKeys = new Set(
      Object.values(externalData)
        .flat()
        .map((n) => n[entityPrimaryKeyProperty]),
    );

    const venueNodes = network.nodes.filter(
      (n) =>
        n.type === nodeTypeNamed('venue')[0] && n.stageId === hivServicesRoster,
    );
    expect(venueNodes.length).toBeGreaterThan(0);
    for (const node of venueNodes) {
      expect(rosterKeys.has(node[entityPrimaryKeyProperty])).toBe(true);
    }
  });

  it('never reuses one person across the stages sharing a roster', async () => {
    const protocol = storedProtocol();
    const externalData = await loadRosterNodesForStages(protocol);

    const { network } = generateNetwork({
      codebook: protocol.codebook,
      stages: protocol.protocol.stages,
      formLanguage: protocol.protocol.localization.defaultLocale,
      localization: protocol.protocol.localization,
      seed: 7,
      externalData,
    });

    const shared = new Set(
      externalData[searchableClassmatesRoster]!.map(
        (n) => n[entityPrimaryKeyProperty],
      ),
    );
    const drawn = network.nodes
      .map((n) => n[entityPrimaryKeyProperty])
      .filter((key) => shared.has(key));

    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length).toBeLessThanOrEqual(6);
  });

  it('still generates when the protocol has no rosters at hand', async () => {
    getProtocolAssets.mockResolvedValueOnce([]);
    const protocol = storedProtocol();

    const externalData = await loadRosterNodesForStages(protocol);
    expect(externalData).toEqual({});

    const { network } = generateNetwork({
      codebook: protocol.codebook,
      stages: protocol.protocol.stages,
      formLanguage: protocol.protocol.localization.defaultLocale,
      localization: protocol.protocol.localization,
      seed: 42,
      externalData,
    });

    expect(network.nodes.length).toBeGreaterThan(0);
  });
});
