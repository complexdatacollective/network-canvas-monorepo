import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

const getAssetById = vi.fn();
vi.mock('~/utils/assetUtils', () => ({
  getAssetById: (...args: unknown[]) => getAssetById(...args),
}));

const { collectPreviewRosterData, makeRosterAssetResolver } =
  await import('../previewRosterData');

const PROTOCOL_ID = 'protocol-1';
const PEOPLE_CSV = 'Name,Age\nAda,36\nGrace,45\nAlan,41\n';

const createObjectURL = vi.fn((_blob: unknown) => 'blob:roster');
const revokeObjectURL = vi.fn();

function csvBlob(): Blob {
  return new Blob([PEOPLE_CSV], { type: 'text/csv' });
}

function makeProtocol(
  overrides: Partial<CurrentProtocol> = {},
): CurrentProtocol {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [],
    codebook: {
      node: {
        person: {
          variables: {
            'var-name': { name: 'Name', type: 'text' },
            'var-age': { name: 'Age', type: 'number' },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {
      roster: {
        id: 'roster',
        type: 'network',
        name: 'People',
        source: 'people.csv',
      },
    },
    ...overrides,
  } as unknown as CurrentProtocol;
}

const rosterStage = {
  id: 'stage-ngr',
  label: 'Roster',
  type: 'NameGeneratorRoster',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'roster',
  prompts: [{ id: 'p1', text: 'Pick people' }],
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('makeRosterAssetResolver', () => {
  it('resolves a network asset to an object URL with the manifest source filename', async () => {
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: csvBlob(),
    });

    const resolve = makeRosterAssetResolver(makeProtocol(), PROTOCOL_ID);
    const resolved = await resolve('roster');

    expect(resolved).not.toBeNull();
    expect(resolved!.url).toBe('blob:roster');
    expect(resolved!.sourceFileName).toBe('people.csv');
    expect(getAssetById).toHaveBeenCalledWith('roster', PROTOCOL_ID);

    resolved!.cleanup?.();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('returns null for a non-network manifest entry without touching the store', async () => {
    const protocol = makeProtocol({
      assetManifest: {
        roster: {
          id: 'roster',
          type: 'image',
          name: 'Logo',
          source: 'logo.png',
        },
      },
    } as unknown as Partial<CurrentProtocol>);

    const resolve = makeRosterAssetResolver(protocol, PROTOCOL_ID);

    expect(await resolve('roster')).toBeNull();
    expect(getAssetById).not.toHaveBeenCalled();
  });

  it('returns null when the manifest has no entry for the asset', async () => {
    const protocol = makeProtocol({
      assetManifest: {},
    } as unknown as Partial<CurrentProtocol>);

    const resolve = makeRosterAssetResolver(protocol, PROTOCOL_ID);

    expect(await resolve('roster')).toBeNull();
    expect(getAssetById).not.toHaveBeenCalled();
  });

  it('returns null when the asset is missing from the store', async () => {
    getAssetById.mockResolvedValue(undefined);

    const resolve = makeRosterAssetResolver(makeProtocol(), PROTOCOL_ID);

    expect(await resolve('roster')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('returns null when the stored asset data is a string rather than a blob', async () => {
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: 'inline-data',
    });

    const resolve = makeRosterAssetResolver(makeProtocol(), PROTOCOL_ID);

    expect(await resolve('roster')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('fails soft to null when the store lookup throws', async () => {
    getAssetById.mockRejectedValue(new Error('storage unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const resolve = makeRosterAssetResolver(makeProtocol(), PROTOCOL_ID);

    expect(await resolve('roster')).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('collectPreviewRosterData', () => {
  it('builds external data keyed by stage from the protocol rosters', async () => {
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: csvBlob(),
    });

    const protocol = makeProtocol({
      stages: [rosterStage],
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectPreviewRosterData(protocol, PROTOCOL_ID);

    expect(result['stage-ngr']).toHaveLength(3);
    const [first] = result['stage-ngr']!;
    expect(first!.type).toBe('person');
    expect(first![entityAttributesProperty]['var-name']).toBe('Ada');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('returns {} when a roster asset cannot be resolved', async () => {
    getAssetById.mockResolvedValue(undefined);

    const protocol = makeProtocol({
      stages: [rosterStage],
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectPreviewRosterData(protocol, PROTOCOL_ID);

    expect(result).toEqual({});
  });
});
