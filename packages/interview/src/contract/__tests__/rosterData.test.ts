import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Codebook,
  type Filter,
  type FormField,
  type Panel,
  type Stage,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import {
  collectRosterExternalData,
  filterExternalPanelNodes,
  type ResolvedRosterAsset,
  type ResolveRosterAsset,
} from '../rosterData';

const PEOPLE_CSV = 'Name,Age\nAda,36\nGrace,45\nAlan,41\n';
const PLACES_CSV = 'Name\nOffice\nHome\n';

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'var-name': { name: 'Name', type: 'text' },
        'var-age': { name: 'Age', type: 'number' },
      },
    },
    place: {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        'var-place-name': { name: 'Name', type: 'text' },
      },
    },
  },
};

const nameField: FormField = {
  variable: asEntityAttributeReference('var-name'),
  prompt: 'Name',
};

function rosterStage(id: string, dataSource: string): Stage {
  return {
    id,
    label: 'Roster',
    type: 'NameGeneratorRoster',
    subject: { entity: 'node', type: 'person' },
    dataSource,
    prompts: [{ id: 'p1', text: 'Pick people' }],
  };
}

function nameGeneratorStage(
  id: string,
  panels: Panel[],
  subjectType = 'person',
): Stage {
  return {
    id,
    label: 'Name Generator',
    type: 'NameGenerator',
    form: { title: 'Add people', fields: [nameField] },
    subject: { entity: 'node', type: subjectType },
    panels,
    prompts: [{ id: 'p1', text: 'Add people' }],
  };
}

const ageFilter: Filter = {
  join: 'AND',
  rules: [
    {
      id: 'r1',
      type: 'node',
      options: {
        type: 'person',
        attribute: asEntityAttributeReference('var-age'),
        operator: 'GREATER_THAN',
        value: 40,
      },
    },
  ],
};

// Maps stub URLs to CSV bodies so the stubbed `fetch` can serve distinct
// content per asset without a real network.
function stubFetch(bodiesByUrl: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === 'stub://broken') {
        return Promise.reject(new Error('unreachable'));
      }
      const body = bodiesByUrl[url];
      if (body === undefined) {
        return Promise.reject(new Error(`no stub body for ${url}`));
      }
      return Promise.resolve(new Response(body));
    }),
  );
}

function resolved(
  assetId: string,
  overrides?: Partial<ResolvedRosterAsset>,
): ResolvedRosterAsset {
  return {
    url: `stub://${assetId}`,
    sourceFileName: `${assetId}.csv`,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collectRosterExternalData', () => {
  it('parses a CSV roster into nodes of the stage subject type', async () => {
    stubFetch({ 'stub://roster': PEOPLE_CSV });
    const cleanup = vi.fn();
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('roster', { cleanup }));

    const result = await collectRosterExternalData({
      stages: [rosterStage('stage-ngr', 'roster')],
      codebook,
      resolveAsset,
    });

    expect(result['stage-ngr']).toHaveLength(3);
    const [first] = result['stage-ngr']!;
    expect(first!.type).toBe('person');
    expect(first![entityAttributesProperty]['var-name']).toBe('Ada');
    // cleanup runs after a successful parse too, not only on failure.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('offers only the rows a filtered panel would show', async () => {
    stubFetch({ 'stub://panel': PEOPLE_CSV });
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('panel'));

    const panels: Panel[] = [
      {
        id: 'b',
        title: 'Older people',
        dataSource: 'panel',
        filter: ageFilter,
      },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    expect(result['stage-ng']).toHaveLength(2);
    const names = result['stage-ng']!.map(
      (n) => n[entityAttributesProperty]['var-name'],
    );
    expect(names).not.toContain('Ada');
  });

  it('merges multiple panels by primary key and ignores existing-dataSource panels', async () => {
    stubFetch({
      'stub://panel-people': PEOPLE_CSV,
      'stub://panel-places': PLACES_CSV,
    });
    const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) => {
      if (assetId === 'panel-people' || assetId === 'panel-places') {
        return Promise.resolve(resolved(assetId));
      }
      return Promise.resolve(null);
    });

    const panels: Panel[] = [
      { id: 'a', title: 'Previously', dataSource: 'existing' },
      { id: 'b', title: 'People', dataSource: 'panel-people' },
      { id: 'c', title: 'Places', dataSource: 'panel-places' },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    // 3 people + 2 places, with the "existing" panel contributing nothing.
    expect(result['stage-ng']).toHaveLength(5);
    expect(resolveAsset).not.toHaveBeenCalledWith('existing');
  });

  it('parses the same asset once per assetId::subjectType and produces per-type pools', async () => {
    stubFetch({ 'stub://roster': PEOPLE_CSV });
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('roster'));

    const result = await collectRosterExternalData({
      stages: [
        rosterStage('as-person-a', 'roster'),
        rosterStage('as-person-b', 'roster'),
        {
          id: 'as-place',
          label: 'Roster',
          type: 'NameGeneratorRoster',
          subject: { entity: 'node', type: 'place' },
          dataSource: 'roster',
          prompts: [{ id: 'p1', text: 'Pick places' }],
        },
      ],
      codebook,
      resolveAsset,
    });

    // Same assetId + same subject type (person) is parsed once and reused.
    // A different subject type (place) triggers a second, separate parse.
    expect(resolveAsset).toHaveBeenCalledTimes(2);
    expect(result['as-person-a']![0]!.type).toBe('person');
    expect(result['as-person-b']![0]!.type).toBe('person');
    expect(result['as-place']![0]!.type).toBe('place');
    expect(
      result['as-place']![0]![entityAttributesProperty]['var-place-name'],
    ).toBe('Ada');
  });

  it('isolates a failing parse: sibling stages keep their pools, console.error fires, cleanup still runs', async () => {
    stubFetch({ 'stub://roster': PEOPLE_CSV });
    const okCleanup = vi.fn();
    const brokenCleanup = vi.fn();
    const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) => {
      if (assetId === 'roster') {
        return Promise.resolve(resolved('roster', { cleanup: okCleanup }));
      }
      if (assetId === 'broken') {
        return Promise.resolve(
          resolved('broken', {
            url: 'stub://broken',
            cleanup: brokenCleanup,
          }),
        );
      }
      return Promise.resolve(null);
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await collectRosterExternalData({
      stages: [rosterStage('ok', 'roster'), rosterStage('bad', 'broken')],
      codebook,
      resolveAsset,
    });

    expect(result.ok).toHaveLength(3);
    expect(result.bad).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"broken"'),
      expect.any(Error),
    );
    expect(brokenCleanup).toHaveBeenCalledTimes(1);
  });

  it('isolates a failing resolveAsset the same way, without calling cleanup', async () => {
    stubFetch({ 'stub://roster': PEOPLE_CSV });
    const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) => {
      if (assetId === 'roster') {
        return Promise.resolve(resolved('roster'));
      }
      return Promise.reject(new Error('could not decrypt asset'));
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await collectRosterExternalData({
      stages: [rosterStage('ok', 'roster'), rosterStage('bad', 'unreadable')],
      codebook,
      resolveAsset,
    });

    expect(result.ok).toHaveLength(3);
    expect(result.bad).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"unreadable"'),
      expect.any(Error),
    );
  });

  it('drops draft roster stages missing subject or dataSource, leaving siblings intact', async () => {
    stubFetch({ 'stub://roster': PEOPLE_CSV });
    const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) => {
      if (assetId === 'roster') {
        return Promise.resolve(resolved('roster'));
      }
      return Promise.resolve(null);
    });

    // Draft/unvalidated stages the host may feed in: `subject` or `dataSource`
    // absent despite the schema types marking them required.
    const draftMissingSubject = {
      id: 'draft-no-subject',
      label: 'Roster',
      type: 'NameGeneratorRoster',
      dataSource: 'draft-roster',
      prompts: [{ id: 'p1', text: 'Pick people' }],
    } as unknown as Stage;
    const draftMissingDataSource = {
      id: 'draft-no-source',
      label: 'Roster',
      type: 'NameGeneratorRoster',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Pick people' }],
    } as unknown as Stage;

    // A throw would reject this await and fail the test.
    const result = await collectRosterExternalData({
      stages: [
        draftMissingSubject,
        draftMissingDataSource,
        rosterStage('ok', 'roster'),
      ],
      codebook,
      resolveAsset,
    });

    expect(result.ok).toHaveLength(3);
    expect(result['draft-no-subject']).toBeUndefined();
    expect(result['draft-no-source']).toBeUndefined();
    // The dropped stages never reach asset resolution.
    expect(resolveAsset).not.toHaveBeenCalledWith('draft-roster');
    expect(resolveAsset).toHaveBeenCalledWith('roster');
  });

  it('collapses byte-identical rows from two panels to one entry per content hash', async () => {
    stubFetch({
      'stub://panel-a': PEOPLE_CSV,
      'stub://panel-b': PEOPLE_CSV,
    });
    const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) => {
      if (assetId === 'panel-a' || assetId === 'panel-b') {
        return Promise.resolve(resolved(assetId));
      }
      return Promise.resolve(null);
    });

    const panels: Panel[] = [
      { id: 'a', title: 'First', dataSource: 'panel-a' },
      { id: 'b', title: 'Second', dataSource: 'panel-b' },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    // Both panels parse independently, but byte-identical content yields
    // identical content-hash primary keys, so the later source overwrites the
    // earlier one in the merge map: three rows in, three entries out (not six).
    expect(result['stage-ng']).toHaveLength(3);
    const keys = result['stage-ng']!.map((n) => n[entityPrimaryKeyProperty]);
    expect(new Set(keys).size).toBe(3);
  });

  it('returns {} and never calls resolveAsset when no stage has a roster data source', async () => {
    const resolveAsset: ResolveRosterAsset = vi.fn();

    const result = await collectRosterExternalData({
      stages: [
        {
          id: 'info',
          label: 'Info',
          type: 'Information',
          title: 'Info',
          items: [],
        },
      ],
      codebook,
      resolveAsset,
    });

    expect(result).toEqual({});
    expect(resolveAsset).not.toHaveBeenCalled();
  });
});

describe('filterExternalPanelNodes', () => {
  it('returns the input array unchanged when no filter is given', () => {
    const nodes = [
      {
        _uid: 'n1',
        type: 'person',
        [entityAttributesProperty]: { 'var-name': 'Ada' },
      },
    ];

    expect(filterExternalPanelNodes(nodes)).toBe(nodes);
  });
});
