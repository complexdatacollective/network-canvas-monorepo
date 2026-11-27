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

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import {
  collectRosterExternalData,
  filterExternalPanelNodes,
  parseExternalNetworkAsset,
  type ResolvedRosterAsset,
  type ResolveRosterAsset,
} from '../rosterData';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const AGE = testVariableId('age');
const CAFE = testVariableId('cafe');
const CLOSENESS = testVariableId('closeness');
const DOTTED = testVariableId('dotted');
const NAME = testVariableId('name');
const PLACE_NAME = testVariableId('place-name');
const ROLE = testVariableId('role');
const PROTO = testVariableId('proto');

/** A stage's own words, in the protocol's only language. */
const localized = (text: string) => ({ en: text });

const PEOPLE_CSV = 'Name,Age\nAda,36\nGrace,45\nAlan,41\n';
const PLACES_CSV = 'Name\nOffice\nHome\n';
// Header row only: a roster asset that resolves and parses but has no rows.
const EMPTY_CSV = 'Name,Age\n';

const codebook: Codebook = {
  node: {
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        [NAME]: { name: 'Name', type: 'text' },
        [AGE]: { name: 'Age', type: 'number' },
        [ROLE]: {
          name: 'Role',
          type: 'categorical',
          options: [
            { id: testId('lead'), label: { en: 'Lead' }, value: 'lead' },
          ],
        },
      },
    },
    [PLACE]: {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        [PLACE_NAME]: { name: 'Name', type: 'text' },
      },
    },
  },
};

const nameField: FormField = {
  id: testId('field-name'),
  variable: asEntityAttributeReference(NAME),
  prompt: { en: 'Name' },
};

function rosterStage(id: string, dataSource: string): Stage {
  return {
    id: testId(id),
    label: { en: 'Roster' },
    type: 'NameGeneratorRoster',
    allAddedNotice: { en: 'There is nothing left to add from this list.' },
    unnamedLabel: { en: 'Unnamed {count}' },
    panelTitle: { en: 'Available to add' },
    subject: { entity: 'node', types: [PERSON] },
    dataSource,
    prompts: [{ id: testId(`${id}-p1`), text: { en: 'Pick people' } }],
  };
}

function nameGeneratorStage(
  id: string,
  panels: Panel[],
  subjectType = PERSON,
): Stage {
  return {
    id: testId(id),
    label: { en: 'Name Generator' },
    type: 'NameGenerator',
    form: { title: { en: 'Add people' }, fields: [nameField] },
    subject: { entity: 'node', types: [subjectType] },
    panels,
    prompts: [{ id: testId(`${id}-p1`), text: { en: 'Add people' } }],
  };
}

const ageFilter: Filter = {
  join: 'AND',
  rules: [
    {
      id: testId('r1'),
      type: 'node',
      options: {
        type: PERSON,
        attribute: asEntityAttributeReference(AGE),
        operator: 'GREATER_THAN',
        value: 40,
      },
    },
  ],
};

// Keeps nobody: no roster person is older than 200.
const impossibleAgeFilter: Filter = {
  join: 'AND',
  rules: [
    {
      id: testId('r1'),
      type: 'node',
      options: {
        type: PERSON,
        attribute: asEntityAttributeReference(AGE),
        operator: 'GREATER_THAN',
        value: 200,
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

describe('parseExternalNetworkAsset', () => {
  it('accepts a spaced CSV header and remaps it through the codebook name', async () => {
    stubFetch({ 'stub://roster': 'Full Name,Age\nAda Lovelace,36\n' });
    const spacedNameCodebook: Codebook = {
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME]: {
              name: 'Full Name',
              type: 'text',
            },
            [AGE]: { name: 'Age', type: 'number' },
          },
        },
      },
    };

    const [node] = await parseExternalNetworkAsset({
      sourceFileName: 'roster.csv',
      url: 'stub://roster',
      codebook: spacedNameCodebook,
      subject: { entity: 'node', type: PERSON },
    });

    expect(node?.[entityAttributesProperty][NAME]).toBe('Ada Lovelace');
  });

  it('preserves valid unknown CSV attributes through type replacement', async () => {
    stubFetch({ 'stub://roster': 'Name,Nickname\nAda,Countess\n' });

    const [node] = await parseExternalNetworkAsset({
      sourceFileName: 'roster.csv',
      url: 'stub://roster',
      codebook,
      subject: { entity: 'node', type: PERSON },
    });

    expect(node?.[entityAttributesProperty]).toEqual({
      [NAME]: 'Ada',
      Nickname: 'Countess',
    });
  });

  it('preserves pass-through CSV attributes whose headers are not variable names', async () => {
    stubFetch({
      'stub://roster':
        'Name,profile page\nAda,https://example.com/people/ada\n',
    });

    const [node] = await parseExternalNetworkAsset({
      sourceFileName: 'roster.csv',
      url: 'stub://roster',
      codebook,
      subject: { entity: 'node', type: PERSON },
    });

    expect(node?.[entityAttributesProperty]).toEqual({
      [NAME]: 'Ada',
      'profile page': 'https://example.com/people/ada',
    });
  });

  it('rejects a malformed number created by CSV type replacement', async () => {
    stubFetch({ 'stub://roster': 'Name,Age\nAda,not-a-number\n' });

    await expect(
      parseExternalNetworkAsset({
        sourceFileName: 'roster.csv',
        url: 'stub://roster',
        codebook,
        subject: { entity: 'node', type: PERSON },
      }),
    ).rejects.toThrow();
  });

  it('rejects an arbitrary object created by CSV JSON conversion', async () => {
    const body = 'Name,Role\nAda,"{""unexpected"":true}"\n';
    stubFetch({ 'stub://roster': body });

    await expect(
      parseExternalNetworkAsset({
        sourceFileName: 'roster.csv',
        url: 'stub://roster',
        codebook,
        subject: { entity: 'node', type: PERSON },
      }),
    ).rejects.toThrow();
  });

  describe('with names a researcher may now choose', () => {
    const unrestrictedCodebook: Codebook = {
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME]: {
              name: 'Full name',
              type: 'text',
            },
            [AGE]: { name: '年龄', type: 'number' },
            [CAFE]: { name: 'Café', type: 'text' },
            [DOTTED]: { name: 'a.b', type: 'text' },
            [CLOSENESS]: {
              name: 'Closeness',
              type: 'categorical',
              options: [
                {
                  id: testId('rosterData option 1'),
                  label: { en: 'Close friend' },
                  value: 'close friend',
                },
                {
                  id: testId('rosterData option 2'),
                  label: { en: 'Colleague' },
                  value: '同事',
                },
                {
                  id: testId('rosterData option 3'),
                  label: { en: 'Null' },
                  value: 'null',
                },
                {
                  id: testId('rosterData option 4'),
                  label: { en: 'One' },
                  value: 1,
                },
              ],
            },
          },
        },
      },
    };

    const parseRoster = (body: string, rosterCodebook: Codebook) => {
      stubFetch({ 'stub://roster': body });

      return parseExternalNetworkAsset({
        sourceFileName: 'roster.csv',
        url: 'stub://roster',
        codebook: rosterCodebook,
        subject: { entity: 'node', type: PERSON },
      });
    };

    it('remaps columns named with spaces, other scripts, dots and decomposed letters', async () => {
      const nodes = await parseRoster(
        [
          'Full name,年龄,Cafe\u0301,a.b',
          'Ada Lovelace,36,espresso,dotted',
          '',
        ].join('\n'),
        unrestrictedCodebook,
      );

      expect(nodes.map((node) => node[entityAttributesProperty])).toEqual([
        {
          [NAME]: 'Ada Lovelace',
          [AGE]: 36,
          [CAFE]: 'espresso',
          [DOTTED]: 'dotted',
        },
      ]);
    });

    it('collects categorical option columns into the codebook option values', async () => {
      const nodes = await parseRoster(
        [
          'Closeness_close friend,Closeness_同事,Closeness_null,Closeness_1',
          'true,true,true,false',
          'false,false,false,true',
          '',
        ].join('\n'),
        unrestrictedCodebook,
      );

      expect(nodes.map((node) => node[entityAttributesProperty])).toEqual([
        { [CLOSENESS]: ['close friend', '同事', 'null'] },
        { [CLOSENESS]: [1] },
      ]);
    });

    it('derives the type of an unmatched column from its data whatever its header contains', async () => {
      const [node] = await parseRoster(
        'Full name,score[1],x]y,toString\nAda,5,6,7\n',
        unrestrictedCodebook,
      );

      expect(node?.[entityAttributesProperty]).toEqual({
        [NAME]: 'Ada',
        'score[1]': 5,
        'x]y': 6,
        'toString': 7,
      });
    });

    it('remaps a column to a variable that is named __proto__', async () => {
      const [node] = await parseRoster('Full name,__proto__\nAda,payload\n', {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              [NAME]: {
                name: 'Full name',
                type: 'text',
              },
              [PROTO]: {
                name: '__proto__',
                type: 'text',
              },
            },
          },
        },
      });

      expect(node?.[entityAttributesProperty]).toEqual({
        [NAME]: 'Ada',
        [PROTO]: 'payload',
      });
    });

    it('does not let an unmatched __proto__ column reach the prototype of the attributes', async () => {
      const [node] = await parseRoster(
        'Full name,__proto__\nAda,payload\n',
        unrestrictedCodebook,
      );
      const attributes = node?.[entityAttributesProperty];

      expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
      expect(attributes).toEqual({ [NAME]: 'Ada' });
    });
  });
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

    expect(result[testId('stage-ngr')]).toHaveLength(3);
    const [first] = result[testId('stage-ngr')]!;
    expect(first!.type).toBe(PERSON);
    expect(first![entityAttributesProperty][NAME]).toBe('Ada');
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
        id: testId('b'),
        title: { en: 'Older people' },
        dataSource: 'panel',
        filter: ageFilter,
      },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    expect(result[testId('stage-ng')]).toHaveLength(2);
    const names = result[testId('stage-ng')]!.map(
      (n) => n[entityAttributesProperty][NAME],
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
      { id: testId('a'), title: { en: 'Previously' }, dataSource: 'existing' },
      { id: testId('b'), title: { en: 'People' }, dataSource: 'panel-people' },
      { id: testId('c'), title: { en: 'Places' }, dataSource: 'panel-places' },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    // 3 people + 2 places, with the "existing" panel contributing nothing.
    expect(result[testId('stage-ng')]).toHaveLength(5);
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
          id: testId('as-place'),
          label: { en: 'Roster' },
          type: 'NameGeneratorRoster',
          allAddedNotice: {
            en: 'There is nothing left to add from this list.',
          },
          unnamedLabel: { en: 'Unnamed {count}' },
          panelTitle: { en: 'Available to add' },
          subject: { entity: 'node', types: [PLACE] },
          dataSource: 'roster',
          prompts: [{ id: testId('p1'), text: { en: 'Pick places' } }],
        },
      ],
      codebook,
      resolveAsset,
    });

    // Same assetId + same subject type (person) is parsed once and reused.
    // A different subject type (place) triggers a second, separate parse.
    expect(resolveAsset).toHaveBeenCalledTimes(2);
    expect(result[testId('as-person-a')]![0]!.type).toBe(PERSON);
    expect(result[testId('as-person-b')]![0]!.type).toBe(PERSON);
    expect(result[testId('as-place')]![0]!.type).toBe(PLACE);
    expect(
      result[testId('as-place')]![0]![entityAttributesProperty][PLACE_NAME],
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

    expect(result[testId('ok')]).toHaveLength(3);
    expect(result[testId('bad')]).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"broken"'),
      expect.any(Error),
    );
    expect(brokenCleanup).toHaveBeenCalledTimes(1);
  });

  it('does not expose a partial pool when a later row has an invalid value', async () => {
    stubFetch({
      'stub://roster': 'Name,Age\nAda,36\nGrace,not-a-number\n',
    });
    const cleanup = vi.fn();
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('roster', { cleanup }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await collectRosterExternalData({
      stages: [rosterStage('stage-ngr', 'roster')],
      codebook,
      resolveAsset,
    });

    expect(result).toEqual({});
    expect(cleanup).toHaveBeenCalledTimes(1);
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

    expect(result[testId('ok')]).toHaveLength(3);
    expect(result[testId('bad')]).toBeUndefined();
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
      id: testId('draft-no-subject'),
      label: 'Roster',
      type: 'NameGeneratorRoster',
      allAddedNotice: localized('There is nothing left to add from this list.'),
      unnamedLabel: localized('Unnamed {count}'),
      dataSource: 'draft-roster',
      prompts: [{ id: testId('p1'), text: 'Pick people' }],
    } as unknown as Stage;
    const draftMissingDataSource = {
      id: testId('draft-no-source'),
      label: 'Roster',
      type: 'NameGeneratorRoster',
      allAddedNotice: localized('There is nothing left to add from this list.'),
      unnamedLabel: localized('Unnamed {count}'),
      subject: { entity: 'node', types: [PERSON] },
      prompts: [{ id: testId('p1'), text: 'Pick people' }],
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

    expect(result[testId('ok')]).toHaveLength(3);
    expect(result[testId('draft-no-subject')]).toBeUndefined();
    expect(result[testId('draft-no-source')]).toBeUndefined();
    // The dropped stages never reach asset resolution.
    expect(resolveAsset).not.toHaveBeenCalledWith('draft-roster');
    expect(resolveAsset).toHaveBeenCalledWith('roster');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a node subject with no types', { entity: 'node' }],
    [
      'a node subject whose types is a string',
      { entity: 'node', types: PERSON },
    ],
    ['a node subject listing a number', { entity: 'node', types: [1] }],
    [
      'a node subject listing two types',
      { entity: 'node', types: [PERSON, PERSON] },
    ],
  ])(
    'drops a draft roster stage whose subject is %s, leaving siblings intact',
    async (_, subject) => {
      stubFetch({ 'stub://roster': PEOPLE_CSV });
      const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) =>
        Promise.resolve(assetId === 'roster' ? resolved('roster') : null),
      );
      const draft = {
        id: testId('draft-subject'),
        label: 'Roster',
        type: 'NameGeneratorRoster',
        allAddedNotice: localized(
          'There is nothing left to add from this list.',
        ),
        unnamedLabel: localized('Unnamed {count}'),
        dataSource: 'draft-roster',
        subject,
        prompts: [{ id: testId('p1'), text: 'Pick people' }],
      } as unknown as Stage;

      // A throw would reject this await and fail the test.
      const result = await collectRosterExternalData({
        stages: [draft, rosterStage('ok', 'roster')],
        codebook,
        resolveAsset,
      });

      expect(result[testId('ok')]).toHaveLength(3);
      expect(result[testId('draft-subject')]).toBeUndefined();
      expect(resolveAsset).not.toHaveBeenCalledWith('draft-roster');
    },
  );

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
      { id: testId('a'), title: { en: 'First' }, dataSource: 'panel-a' },
      { id: testId('b'), title: { en: 'Second' }, dataSource: 'panel-b' },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    // Both panels parse independently, but byte-identical content yields
    // identical content-hash primary keys, so the later source overwrites the
    // earlier one in the merge map: three rows in, three entries out (not six).
    expect(result[testId('stage-ng')]).toHaveLength(3);
    const keys = result[testId('stage-ng')]!.map(
      (n) => n[entityPrimaryKeyProperty],
    );
    expect(new Set(keys).size).toBe(3);
  });

  it('emits an empty pool for a roster that resolves but has no rows', async () => {
    stubFetch({ 'stub://empty': EMPTY_CSV });
    const cleanup = vi.fn();
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('empty', { cleanup }));

    const result = await collectRosterExternalData({
      stages: [rosterStage('stage-ngr', 'empty')],
      codebook,
      resolveAsset,
    });

    // Key present (a resolvable but empty roster), distinct from an absent key.
    expect(testId('stage-ngr') in result).toBe(true);
    expect(result[testId('stage-ngr')]).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('emits an empty pool when a panel filter removes every row', async () => {
    stubFetch({ 'stub://panel': PEOPLE_CSV });
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('panel'));

    const panels: Panel[] = [
      {
        id: testId('b'),
        title: { en: 'Nobody' },
        dataSource: 'panel',
        filter: impossibleAgeFilter,
      },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    expect(testId('stage-ng') in result).toBe(true);
    expect(result[testId('stage-ng')]).toEqual([]);
  });

  it('omits a stage whose only source cannot be resolved', async () => {
    const resolveAsset: ResolveRosterAsset = vi.fn().mockResolvedValue(null);

    const result = await collectRosterExternalData({
      stages: [rosterStage('all-failed', 'missing')],
      codebook,
      resolveAsset,
    });

    // Every source failed, so the stage is absent — generation falls back to
    // fabrication rather than treating this as a known-empty roster.
    expect(testId('all-failed') in result).toBe(false);
    expect(result).toEqual({});
  });

  it('emits an empty pool when one source fails but another succeeds with no rows', async () => {
    stubFetch({ 'stub://empty': EMPTY_CSV });
    // spyOn returns the file's already-installed spy; clear its accumulated
    // calls so the count below is scoped to this test.
    vi.spyOn(console, 'error')
      .mockImplementation(() => {})
      .mockClear();
    const resolveAsset: ResolveRosterAsset = vi.fn((assetId: string) =>
      Promise.resolve(resolved(assetId)),
    );

    const panels: Panel[] = [
      { id: testId('a'), title: { en: 'Broken' }, dataSource: 'broken' },
      { id: testId('b'), title: { en: 'Empty' }, dataSource: 'empty' },
    ];

    const result = await collectRosterExternalData({
      stages: [nameGeneratorStage('stage-ng', panels)],
      codebook,
      resolveAsset,
    });

    // One source parsed successfully (with zero rows), so the roster is known
    // empty — key present with [] — despite the sibling source failing.
    expect(testId('stage-ng') in result).toBe(true);
    expect(result[testId('stage-ng')]).toEqual([]);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('returns {} and never calls resolveAsset when no stage has a roster data source', async () => {
    const resolveAsset: ResolveRosterAsset = vi.fn();

    const result = await collectRosterExternalData({
      stages: [
        {
          id: testId('info'),
          label: { en: 'Info' },
          type: 'Information',
          content: { en: '# Info' },
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
        type: PERSON,
        [entityAttributesProperty]: { [NAME]: 'Ada' },
      },
    ];

    expect(filterExternalPanelNodes(nodes)).toBe(nodes);
  });
});
