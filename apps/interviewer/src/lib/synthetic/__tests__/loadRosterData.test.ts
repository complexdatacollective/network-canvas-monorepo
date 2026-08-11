import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import type { StoredAsset, StoredProtocol } from '../../db/types';

const getProtocolAssets = vi.fn();

vi.mock('../../db/api', () => ({
  getProtocolAssets: (...args: unknown[]) => getProtocolAssets(...args),
}));

const { loadRosterNodesForStages } = await import('../loadRosterData');

const HASH = 'protocol-hash';

const createObjectURL = vi.fn((_blob: unknown) => 'blob:roster');
const revokeObjectURL = vi.fn();

function csvBlob(body: string): Blob {
  return new Blob([body], { type: 'text/csv' });
}

const PEOPLE_CSV = 'Name,Age\nAda,36\nGrace,45\nAlan,41\n';

function storedAsset(partial: Partial<StoredAsset>): StoredAsset {
  return {
    id: `${HASH}::${partial.assetId ?? 'roster'}`,
    protocolHash: HASH,
    assetId: partial.assetId ?? 'roster',
    name: partial.name ?? 'People',
    type: partial.type ?? 'network',
    data: partial.data ?? csvBlob(PEOPLE_CSV),
  };
}

function storedProtocol(
  stages: unknown[],
  manifest: Record<string, { type: string; name: string; source?: string }>,
): StoredProtocol {
  return {
    id: HASH,
    hash: HASH,
    name: 'Test',
    schemaVersion: 8,
    importedAt: new Date().toISOString(),
    codebook: {
      node: {
        person: {
          variables: {
            'var-name': { name: 'Name', type: 'text' },
            'var-age': { name: 'Age', type: 'number' },
          },
        },
      },
    },
    protocol: { stages, assetManifest: manifest },
  } as unknown as StoredProtocol;
}

function rosterStage(overrides?: Record<string, unknown>) {
  return {
    id: 'stage-ngr',
    label: 'Roster',
    type: 'NameGeneratorRoster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'roster',
    prompts: [{ id: 'p1', text: 'Pick people' }],
    ...overrides,
  };
}

const MANIFEST = {
  roster: { type: 'network', name: 'People', source: 'people.csv' },
};

beforeEach(() => {
  vi.clearAllMocks();
  createObjectURL.mockReturnValue('blob:roster');
  // Subclass rather than spread so URL stays constructible (jsdom builds
  // `new URL(...)` internally); vi.unstubAllGlobals then restores it.
  class StubURL extends URL {}
  vi.stubGlobal(
    'URL',
    Object.assign(StubURL, { createObjectURL, revokeObjectURL }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(PEOPLE_CSV))),
  );
  getProtocolAssets.mockResolvedValue([storedAsset({})]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// These tests cover only the adapter's own responsibilities — joining stored
// assets to roster sources, gating on asset type/shape, the object-URL
// create/revoke lifecycle, and the source-filename choice. The parse, merge,
// and panel-filter semantics live in @codaco/interview and are tested there.
describe('loadRosterNodesForStages', () => {
  it('resolves a roster asset to an object URL and revokes it once parsed', async () => {
    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result['stage-ngr']).toHaveLength(3);
    const [first] = result['stage-ngr']!;
    expect(first!.type).toBe('person');
    expect(first![entityAttributesProperty]['var-name']).toBe('Ada');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('prefers the manifest source over the stored asset name as the parse filename', async () => {
    // The stored asset name would parse as JSON; only the manifest's
    // `people.csv` source yields the CSV parse that produces rows.
    getProtocolAssets.mockResolvedValue([storedAsset({ name: 'roster.json' })]);

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result['stage-ngr']).toHaveLength(3);
  });

  it('falls back to the stored asset name when the manifest has no source', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ name: 'people.csv' })]);

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], {}),
    );

    expect(result['stage-ngr']).toHaveLength(3);
  });

  it('omits a stage whose roster asset is missing', async () => {
    getProtocolAssets.mockResolvedValue([]);

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('omits a stage whose asset is not a network asset', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ type: 'image' })]);

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('omits a stage whose asset data is a string rather than a blob', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ data: 'inline-data' })]);

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object URL even when parsing the asset fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('unreadable'))),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('still resolves to {} when the whole asset read fails', async () => {
    getProtocolAssets.mockRejectedValue(new Error('undecryptable asset'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
  });

  it('never reads protocol assets when no stage uses a roster', async () => {
    const result = await loadRosterNodesForStages(
      storedProtocol(
        [{ id: 'info', label: 'Info', type: 'Information', items: [] }],
        {},
      ),
    );

    expect(result).toEqual({});
    expect(getProtocolAssets).not.toHaveBeenCalled();
  });
});
