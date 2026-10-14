import { describe, expect, it } from 'vitest';

import {
  type DynamicValueSiteContext,
  dynamicValueRolesAt,
  type MessageNode,
} from '@codaco/protocol-validation';

import {
  bindingFor,
  bindingRecordedFor,
  dynamicValueChoices,
  dynamicValueNamesUsedIn,
} from '../dynamicValueCatalog';

const EGO = {
  name: { name: 'Name', type: 'text' },
  secret: { name: 'Secret', type: 'text', encrypted: true },
  layout: { name: 'Position', type: 'layout' },
  children: { name: 'Number of children', type: 'number' },
  smokes: { name: 'Smokes', type: 'boolean' },
  vapes: { name: 'Vapes', type: 'boolean', component: 'Toggle' },
  drinks: {
    name: 'Drinks',
    type: 'boolean',
    component: 'Boolean',
    options: [
      { value: true, label: { en: 'Drinks' } },
      { value: false, label: { en: 'Does not drink' } },
    ],
  },
} as const;

const NODE = {
  name: { name: 'Name', type: 'text' },
  closeness: {
    name: 'Closeness',
    type: 'ordinal',
    options: [
      { value: 1, label: { en: 'Very close' } },
      { value: 'not close', label: { en: 'Not close' } },
    ],
  },
} as const;

const contextFor = (
  stageType: string,
  site: 'stageText' | 'prompt' | 'formField',
  withNode = false,
): DynamicValueSiteContext => ({
  roles: dynamicValueRolesAt(
    stageType,
    site,
    withNode ? { entity: 'node', type: 'person' } : undefined,
  ),
  variablesFor: (role) =>
    role === 'ego'
      ? EGO
      : role === 'node' || role.startsWith('dyad')
        ? NODE
        : undefined,
  notYetWritten: undefined,
});

const labelText = (label: unknown) =>
  typeof label === 'object' && label !== null && 'en' in label
    ? String(label.en)
    : '';

describe('dynamicValueChoices', () => {
  it('offers today’s date and the attributes text can show, and nothing else', () => {
    const paths = dynamicValueChoices(
      contextFor('Information', 'stageText'),
    ).map((choice) => choice.path);
    expect(paths).toEqual([
      'now',
      'ego.name',
      'ego.children',
      'ego.smokes',
      'ego.vapes',
      'ego.drinks',
    ]);
  });

  it('adds the pair on a dyad prompt', () => {
    const paths = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).map(
      (choice) => choice.path,
    );
    expect(paths).toContain('dyad.source.closeness');
    expect(paths).toContain('dyad.target.name');
  });

  it('gives a yes-or-no attribute without labels its two answers', () => {
    const smokes = dynamicValueChoices(
      contextFor('Information', 'stageText'),
    ).find((choice) => choice.path === 'ego.smokes');
    expect(smokes?.options.map((option) => option.value)).toEqual([
      true,
      false,
    ]);
  });
  it('offers a yes-or-no attribute as words only once both answers have labels', () => {
    const unshowable = Object.fromEntries(
      dynamicValueChoices(contextFor('Information', 'stageText')).map(
        (choice) => [choice.path, choice.unshowable],
      ),
    );
    expect(unshowable).toEqual({
      'now': undefined,
      'ego.name': undefined,
      'ego.children': undefined,
      'ego.smokes': 'needsLabels',
      'ego.vapes': 'switch',
      'ego.drinks': undefined,
    });
  });
});

describe('bindingFor', () => {
  const choices = dynamicValueChoices(contextFor('DyadCensus', 'prompt'));
  const choice = (path: string) => {
    const found = choices.find((each) => each.path === path);
    if (found === undefined) throw new Error(path);
    return found;
  };

  it('names a binding for the attribute, prefixed for each person of a pair', () => {
    expect(bindingFor(choice('ego.name'), {}, {}, labelText).name).toBe('name');
    expect(bindingFor(choice('dyad.source.name'), {}, {}, labelText).name).toBe(
      'firstName',
    );
    expect(bindingFor(choice('dyad.target.name'), {}, {}, labelText).name).toBe(
      'secondName',
    );
    expect(bindingFor(choice('now'), {}, {}, labelText).name).toBe('today');
  });

  it('numbers a name the stage already uses for something else', () => {
    expect(
      bindingFor(
        choice('ego.name'),
        { name: { path: 'ego.children' } },
        {},
        labelText,
      ).name,
    ).toBe('name2');
  });

  it('reuses the stage’s binding for the same value', () => {
    expect(
      bindingFor(
        choice('ego.name'),
        { you: { path: 'ego.name' } },
        {},
        labelText,
      ),
    ).toEqual({ name: 'you', binding: { path: 'ego.name' } });
  });

  it('names a case for each answer, from its value or its label', () => {
    expect(
      bindingFor(choice('dyad.source.closeness'), {}, {}, labelText).binding,
    ).toEqual({
      path: 'dyad.source.closeness',
      cases: { veryClose: 1, notClose: 'not close' },
    });
    expect(bindingFor(choice('ego.smokes'), {}, {}, labelText).binding).toEqual(
      {
        path: 'ego.smokes',
        cases: { yes: true, no: false },
      },
    );
  });
});

describe('the cases recorded for a value with answers', () => {
  const closeness = {
    path: 'dyad.source.closeness',
    cases: { veryClose: 1, notClose: 'not close' },
  } as const;
  const shown: MessageNode[] = [
    { kind: 'text', text: 'You are ' },
    { kind: 'argument', name: 'firstCloseness' },
  ];
  const byAnswer: MessageNode[] = [
    {
      kind: 'switch',
      argument: 'firstCloseness',
      type: 'select',
      versions: [
        { key: 'veryClose', nodes: [{ kind: 'text', text: 'close' }] },
        { key: 'other', nodes: [] },
      ],
    },
  ];

  it('binds a value shown only as itself without cases', () => {
    expect(
      bindingRecordedFor('firstCloseness', closeness, undefined, shown),
    ).toEqual({ path: 'dyad.source.closeness' });
  });

  it('binds a value shown by answer with its cases', () => {
    expect(
      bindingRecordedFor('firstCloseness', closeness, undefined, byAnswer),
    ).toEqual(closeness);
  });

  it('finds a by-answer version inside another set of versions', () => {
    const nested: MessageNode[] = [
      {
        kind: 'switch',
        argument: 'name',
        type: 'select',
        versions: [{ key: 'other', nodes: byAnswer }],
      },
    ];
    expect(
      bindingRecordedFor('firstCloseness', closeness, undefined, nested),
    ).toEqual(closeness);
  });

  it('adds the cases to a binding once the text shows a version by answer', () => {
    const plain = { path: 'dyad.source.closeness' };
    expect(
      bindingRecordedFor('firstCloseness', closeness, plain, shown),
    ).toBeUndefined();
    expect(
      bindingRecordedFor('firstCloseness', closeness, plain, byAnswer),
    ).toEqual(closeness);
  });

  it('keeps the name of a binding recording some of the answers, offering the rest', () => {
    const choice = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).find(
      (each) => each.path === 'dyad.source.closeness',
    );
    if (choice === undefined) throw new Error('no choice');
    expect(
      bindingFor(
        choice,
        { close: { path: 'dyad.source.closeness', cases: { near: 1 } } },
        {},
        labelText,
      ),
    ).toEqual({
      name: 'close',
      binding: {
        path: 'dyad.source.closeness',
        cases: { near: 1, notClose: 'not close' },
      },
    });
  });

  it('changes a binding only for a version by an answer it does not record yet', () => {
    const partial = { path: 'dyad.source.closeness', cases: { veryClose: 1 } };
    const onRecorded: MessageNode[] = [
      {
        kind: 'switch',
        argument: 'firstCloseness',
        type: 'select',
        versions: [
          { key: 'veryClose', nodes: [] },
          { key: 'other', nodes: [] },
        ],
      },
    ];
    expect(
      bindingRecordedFor('firstCloseness', closeness, partial, onRecorded),
    ).toBeUndefined();
    const onAdded: MessageNode[] = [
      {
        kind: 'switch',
        argument: 'firstCloseness',
        type: 'select',
        versions: [
          { key: 'notClose', nodes: [] },
          { key: 'other', nodes: [] },
        ],
      },
    ];
    expect(
      bindingRecordedFor('firstCloseness', closeness, partial, onAdded),
    ).toEqual(closeness);
  });

  it('offers cases under the name of a binding recorded without them', () => {
    const choice = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).find(
      (each) => each.path === 'dyad.source.closeness',
    );
    if (choice === undefined) throw new Error('no choice');
    expect(
      bindingFor(
        choice,
        { close: { path: 'dyad.source.closeness' } },
        {},
        labelText,
      ),
    ).toEqual({ name: 'close', binding: closeness });
  });
});

describe('dynamicValueNamesUsedIn', () => {
  it('finds the names every text in a stage uses', () => {
    expect(
      [
        ...dynamicValueNamesUsedIn({
          title: { en: 'Hi {name, select, missing {there} other {{name}}}' },
          prompts: [{ text: { en: 'Since {today}', fr: "Depuis '{today}'" } }],
          label: 'Literal {braces} in a label',
        }),
      ].sort(),
    ).toEqual(['braces', 'name', 'today']);
  });
});
