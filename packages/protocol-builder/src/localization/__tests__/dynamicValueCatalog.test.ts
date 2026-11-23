import { describe, expect, it } from 'vitest';

import {
  type DynamicValueSiteContext,
  dynamicValueContextFor,
  dynamicValueParticipantRolesAt,
  dynamicValueRolesAt,
  type MessageNode,
  nodeLabelValueContext,
} from '@codaco/protocol-validation';

import { testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  bindingFor,
  isFlagChoice,
  bindingRecordedFor,
  dynamicValueChoices,
  dynamicValueNamesUsedIn,
} from '../dynamicValueCatalog';

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const LIKES = testTypeId('likes');
const NAME = testVariableId('name');
const SECRET = testVariableId('secret');
const LAYOUT = testVariableId('layout');
const CHILDREN = testVariableId('children');
const SMOKES = testVariableId('smokes');
const VAPES = testVariableId('vapes');
const DRINKS = testVariableId('drinks');
const NODE_NAME = testVariableId('node-name');
const CLOSENESS = testVariableId('closeness');
const NAME_VAR = testVariableId('nameVar');
const NODE_SECRET = testVariableId('node-secret');

const EGO = {
  [NAME]: { name: 'Name', type: 'text' },
  [SECRET]: { name: 'Secret', type: 'text', encrypted: true },
  [LAYOUT]: { name: 'Position', type: 'layout' },
  [CHILDREN]: { name: 'Number of children', type: 'number' },
  [SMOKES]: { name: 'Smokes', type: 'boolean' },
  [VAPES]: { name: 'Vapes', type: 'boolean', component: 'Toggle' },
  [DRINKS]: {
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
  [NODE_NAME]: { name: 'Name', type: 'text' },
  [CLOSENESS]: {
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
    { type: stageType },
    site,
    withNode ? { entity: 'node', isStageSubject: true } : undefined,
  ),
  variablesFor: (role) =>
    role === 'ego'
      ? EGO
      : role === 'node' || role.startsWith('dyad')
        ? NODE
        : undefined,
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
      `ego.${NAME}`,
      `ego.${CHILDREN}`,
      `ego.${SMOKES}`,
      `ego.${VAPES}`,
      `ego.${DRINKS}`,
      'now',
    ]);
  });

  it('lists what the text is about first, then the participant, then the interview', () => {
    const paths = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).map(
      (choice) => choice.path,
    );
    const firstEgo = paths.findIndex((path) => path.startsWith('ego.'));
    expect(
      paths.slice(0, firstEgo).every((path) => path.startsWith('dyad.')),
    ).toBe(true);
    expect(
      paths.slice(firstEgo, -1).every((path) => path.startsWith('ego.')),
    ).toBe(true);
    expect(paths.at(-1)).toBe('now');
  });

  it('adds the pair on a dyad prompt', () => {
    const paths = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).map(
      (choice) => choice.path,
    );
    expect(paths).toContain(`dyad.source.${CLOSENESS}`);
    expect(paths).toContain(`dyad.target.${NODE_NAME}`);
  });

  it('offers each node on screen by its label, before its attributes', () => {
    const paths = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).map(
      (choice) => choice.path,
    );
    expect(paths.filter((path) => path.startsWith('dyad.'))).toEqual([
      'dyad.source.$label',
      `dyad.source.${NODE_NAME}`,
      `dyad.source.${CLOSENESS}`,
      'dyad.target.$label',
      `dyad.target.${NODE_NAME}`,
      `dyad.target.${CLOSENESS}`,
    ]);
    const label = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).find(
      (choice) => choice.path === 'dyad.source.$label',
    );
    expect(label).toMatchObject({ kind: 'label', optional: false });
  });

  it('offers whether the node is the participant on a Family Pedigree person form, after its label', () => {
    const form = { entity: 'node', isStageSubject: true } as const;
    const pedigree: DynamicValueSiteContext = {
      ...contextFor('FamilyPedigree', 'formField', true),
      participantRoles: dynamicValueParticipantRolesAt(
        { type: 'FamilyPedigree' },
        'formField',
        form,
      ),
    };
    const choices = dynamicValueChoices(pedigree);
    expect(
      choices
        .map((choice) => choice.path)
        .filter((path) => path.startsWith('node.')),
    ).toEqual([
      'node.$label',
      'node.$isParticipant',
      `node.${NODE_NAME}`,
      `node.${CLOSENESS}`,
    ]);
    const participant = choices.find(
      (choice) => choice.path === 'node.$isParticipant',
    );
    expect(participant).toMatchObject({
      kind: 'participant',
      optional: false,
      unshowable: 'switch',
    });
    expect(bindingFor(participant!, {}, {}, labelText)).toEqual({
      name: 'isParticipant',
      binding: {
        path: 'node.$isParticipant',
        cases: { participant: true },
      },
    });
    // Any other node form has no participant among its nodes.
    expect(
      dynamicValueChoices(contextFor('AlterForm', 'formField', true)).map(
        (choice) => choice.path,
      ),
    ).not.toContain('node.$isParticipant');
  });

  it('offers an edge form both ends of its edge by label alone', () => {
    const context: DynamicValueSiteContext = {
      roles: dynamicValueRolesAt({ type: 'AlterEdgeForm' }, 'formField', {
        entity: 'edge',
        isStageSubject: true,
      }),
      variablesFor: (role) => (role === 'ego' ? EGO : undefined),
    };
    const paths = dynamicValueChoices(context).map((choice) => choice.path);
    expect(paths).toContain('edge.from.$label');
    expect(paths).toContain('edge.to.$label');
    expect(paths.some((path) => path.startsWith('node.'))).toBe(false);
  });

  it('offers a bin prompt in tap-to-place mode the node being placed, whose label can be missing', () => {
    const context = dynamicValueContextFor({
      codebook: {
        ego: { variables: EGO },
        node: { [PERSON]: { variables: NODE } },
      },
      stage: {
        type: 'OrdinalBin',
        subject: { entity: 'node', type: PERSON },
        behaviours: { interactionMode: 'select' },
      },
      sitePath: ['prompts', 0, 'text'],
      site: 'prompt',
    });
    const label = dynamicValueChoices(context).find(
      (choice) => choice.path === 'node.$label',
    );
    expect(label).toMatchObject({ kind: 'label', optional: true });
  });

  it('offers no label where no single node is on screen', () => {
    const paths = dynamicValueChoices(contextFor('Sociogram', 'prompt')).map(
      (choice) => choice.path,
    );
    expect(paths.some((path) => path.endsWith('$label'))).toBe(false);
  });

  it('gives a yes-or-no attribute without labels its two answers', () => {
    const smokes = dynamicValueChoices(
      contextFor('Information', 'stageText'),
    ).find((choice) => choice.path === `ego.${SMOKES}`);
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
      now: undefined,
      [`ego.${NAME}`]: undefined,
      [`ego.${CHILDREN}`]: undefined,
      [`ego.${SMOKES}`]: 'needsLabels',
      [`ego.${VAPES}`]: 'switch',
      [`ego.${DRINKS}`]: undefined,
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
    expect(bindingFor(choice(`ego.${NAME}`), {}, {}, labelText).name).toBe(
      'name',
    );
    expect(
      bindingFor(choice(`dyad.source.${NODE_NAME}`), {}, {}, labelText).name,
    ).toBe('firstName');
    expect(
      bindingFor(choice(`dyad.target.${NODE_NAME}`), {}, {}, labelText).name,
    ).toBe('secondName');
    expect(bindingFor(choice('now'), {}, {}, labelText).name).toBe('today');
  });

  it('names a binding for each node of a pair’s label', () => {
    expect(bindingFor(choice('dyad.source.$label'), {}, {}, labelText)).toEqual(
      { name: 'firstLabel', binding: { path: 'dyad.source.$label' } },
    );
    expect(
      bindingFor(choice('dyad.target.$label'), {}, {}, labelText).name,
    ).toBe('secondLabel');
  });

  it('numbers a name the stage already uses for something else', () => {
    expect(
      bindingFor(
        choice(`ego.${NAME}`),
        { name: { path: `ego.${CHILDREN}` } },
        {},
        labelText,
      ).name,
    ).toBe('name2');
  });

  it('reuses the stage’s binding for the same value', () => {
    expect(
      bindingFor(
        choice(`ego.${NAME}`),
        { you: { path: `ego.${NAME}` } },
        {},
        labelText,
      ),
    ).toEqual({ name: 'you', binding: { path: `ego.${NAME}` } });
  });

  it('names a case for each answer, from its value or its label', () => {
    expect(
      bindingFor(choice(`dyad.source.${CLOSENESS}`), {}, {}, labelText).binding,
    ).toEqual({
      path: `dyad.source.${CLOSENESS}`,
      cases: { veryClose: 1, notClose: 'not close' },
    });
    expect(
      bindingFor(choice(`ego.${SMOKES}`), {}, {}, labelText).binding,
    ).toEqual({
      path: `ego.${SMOKES}`,
      cases: { yes: true, no: false },
    });
  });
});

describe('the cases recorded for a value with answers', () => {
  const closeness = {
    path: `dyad.source.${CLOSENESS}`,
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
    ).toEqual({ path: `dyad.source.${CLOSENESS}` });
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
    const plain = { path: `dyad.source.${CLOSENESS}` };
    expect(
      bindingRecordedFor('firstCloseness', closeness, plain, shown),
    ).toBeUndefined();
    expect(
      bindingRecordedFor('firstCloseness', closeness, plain, byAnswer),
    ).toEqual(closeness);
  });

  it('keeps the name of a binding recording some of the answers, offering the rest', () => {
    const choice = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).find(
      (each) => each.path === `dyad.source.${CLOSENESS}`,
    );
    if (choice === undefined) throw new Error('no choice');
    expect(
      bindingFor(
        choice,
        { close: { path: `dyad.source.${CLOSENESS}`, cases: { near: 1 } } },
        {},
        labelText,
      ),
    ).toEqual({
      name: 'close',
      binding: {
        path: `dyad.source.${CLOSENESS}`,
        cases: { near: 1, notClose: 'not close' },
      },
    });
  });

  it('changes a binding only for a version by an answer it does not record yet', () => {
    const partial = {
      path: `dyad.source.${CLOSENESS}`,
      cases: { veryClose: 1 },
    };
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
      (each) => each.path === `dyad.source.${CLOSENESS}`,
    );
    if (choice === undefined) throw new Error('no choice');
    expect(
      bindingFor(
        choice,
        { close: { path: `dyad.source.${CLOSENESS}` } },
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
      ].toSorted(),
    ).toEqual(['braces', 'name', 'today']);
  });
});

describe('what a node type’s own label can show', () => {
  const context = nodeLabelValueContext({
    codebook: {
      node: {
        [PERSON]: {
          name: 'Person',
          variables: {
            [NAME_VAR]: { name: 'name', type: 'text' },
            [NODE_SECRET]: { name: 'secret', type: 'text', encrypted: true },
          },
        },
      },
      edge: { [KNOWS]: { name: 'Knows' }, [LIKES]: { name: 'Likes a lot' } },
    },
    nodeType: PERSON,
    conditions: {
      isOld: {
        about: 'node',
        rules: [
          {
            id: 'r1',
            type: 'node',
            options: {
              type: PERSON,
              attribute: NAME_VAR,
              operator: 'EXISTS',
            },
          },
        ],
      },
    },
  });
  const choices = dynamicValueChoices(context);

  it('offers the default label and the node’s attributes, but no encrypted one, no ego attribute and no date', () => {
    expect(
      choices
        .filter(
          (choice) => choice.kind === 'label' || choice.kind === 'attribute',
        )
        .map((choice) => choice.path),
    ).toEqual(['node.$label', `node.${NAME_VAR}`]);
    expect(
      choices.find((choice) => choice.kind === 'label')?.defaultLabel,
    ).toBe(true);
    expect(choices.some((choice) => choice.kind === 'intrinsic')).toBe(false);
    expect(choices.some((choice) => choice.role === 'ego')).toBe(false);
  });

  it('offers each condition the label declares, to be tested and never shown', () => {
    const conditions = choices.filter((choice) => choice.kind === 'condition');
    expect(conditions.map((choice) => choice.path)).toEqual([
      '$condition.isOld',
    ]);
    expect(conditions.every(isFlagChoice)).toBe(true);
    expect(conditions[0]?.unshowable).toBe('switch');
  });

  it('offers nothing about how the node is connected: that is a rule of a condition', () => {
    expect(choices.some((choice) => choice.path.includes('onnected'))).toBe(
      false,
    );
  });
});
