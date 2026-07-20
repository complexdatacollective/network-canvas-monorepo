import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        place: {
          variables: { 'var-place-name': { name: 'Name', type: 'text' } },
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
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  createObjectURL.mockReturnValue('blob:roster');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(PEOPLE_CSV))),
  );
  getProtocolAssets.mockResolvedValue([storedAsset({})]);
});

describe('loadRosterNodesForStages', () => {
  it('parses a CSV roster into nodes of the stage subject type', async () => {
    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result['stage-ngr']).toHaveLength(3);
    const [first] = result['stage-ngr']!;
    expect(first!.type).toBe('person');
    expect(first![entityAttributesProperty]['var-name']).toBe('Ada');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('collects external data panels on a name generator', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ assetId: 'panel' })]);

    const result = await loadRosterNodesForStages(
      storedProtocol(
        [
          {
            id: 'stage-ng',
            label: 'Name Generator',
            type: 'NameGenerator',
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'Add people' }],
            panels: [
              { id: 'a', title: 'Previously', dataSource: 'existing' },
              { id: 'b', title: 'Roster', dataSource: 'panel' },
            ],
          },
        ],
        { panel: { type: 'network', name: 'People', source: 'people.csv' } },
      ),
    );

    expect(result['stage-ng']).toHaveLength(3);
  });

  it('offers only the rows a filtered panel would show', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ assetId: 'panel' })]);

    const result = await loadRosterNodesForStages(
      storedProtocol(
        [
          {
            id: 'stage-ng',
            label: 'Name Generator',
            type: 'NameGenerator',
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'Add people' }],
            panels: [
              {
                id: 'b',
                title: 'Older people',
                dataSource: 'panel',
                filter: {
                  join: 'AND',
                  rules: [
                    {
                      id: 'r1',
                      type: 'node',
                      options: {
                        type: 'person',
                        attribute: 'var-age',
                        operator: 'GREATER_THAN',
                        value: 40,
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
        { panel: { type: 'network', name: 'People', source: 'people.csv' } },
      ),
    );

    expect(result['stage-ng']).toHaveLength(2);
    const names = result['stage-ng']!.map(
      (n) => n[entityAttributesProperty]['var-name'],
    );
    expect(names).not.toContain('Ada');
  });

  it('still generates when the whole asset read fails', async () => {
    getProtocolAssets.mockRejectedValue(new Error('undecryptable asset'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
  });

  it('omits a stage whose roster asset is missing', async () => {
    getProtocolAssets.mockResolvedValue([]);

    const result = await loadRosterNodesForStages(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({});
  });

  it('keeps readable rosters when a sibling asset fails, and revokes its url', async () => {
    const exploding = storedAsset({ assetId: 'broken' });
    createObjectURL.mockImplementation((blob: unknown) =>
      blob === exploding.data ? 'blob:broken' : 'blob:roster',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === 'blob:broken'
          ? Promise.reject(new Error('unreadable'))
          : Promise.resolve(new Response(PEOPLE_CSV)),
      ),
    );
    getProtocolAssets.mockResolvedValue([storedAsset({}), exploding]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loadRosterNodesForStages(
      storedProtocol(
        [
          rosterStage({ id: 'ok' }),
          rosterStage({ id: 'bad', dataSource: 'broken' }),
        ],
        {
          ...MANIFEST,
          broken: { type: 'network', name: 'Broken', source: 'broken.csv' },
        },
      ),
    );

    expect(result.ok).toHaveLength(3);
    expect(result.bad).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:broken');
  });

  it('parses the same asset separately for each subject type', async () => {
    const protocol = storedProtocol(
      [
        rosterStage({ id: 'as-person' }),
        rosterStage({
          id: 'as-place',
          subject: { entity: 'node', type: 'place' },
        }),
      ],
      MANIFEST,
    );
    const result = await loadRosterNodesForStages(protocol);

    expect(result['as-person']![0]!.type).toBe('person');
    expect(result['as-place']![0]!.type).toBe('place');
    expect(result['as-person']![0]![entityAttributesProperty]['var-name']).toBe(
      'Ada',
    );
    expect(
      result['as-place']![0]![entityAttributesProperty]['var-place-name'],
    ).toBe('Ada');
  });

  it('does nothing when no stage uses a roster', async () => {
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
