import { describe, expect, it } from 'vitest';

import {
  type AttributeDynamicValueRole,
  type DynamicValueSiteContext,
  dynamicValueContextFor,
  dynamicValueNameFor,
  dynamicValueParticipantRolesAt,
  dynamicValueRolesAt,
  type LabelledDynamicValueRole,
  nodeLabelValueContext,
  optionCaseKey,
} from '@codaco/protocol-validation';

import { testId, testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  dynamicValueChoices,
  dynamicValueNamesUsedIn,
  isFlagChoice,
} from '../dynamicValueCatalog';

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const LIKES = testTypeId('likes');
const NAME = testVariableId('name');
const SECRET = testVariableId('secret');
const PLACE = testVariableId('place');
const CHILDREN = testVariableId('children');
const SMOKES = testVariableId('smokes');
const VAPES = testVariableId('vapes');
const DRINKS = testVariableId('drinks');
const NODE_NAME = testVariableId('node-name');
const CLOSENESS = testVariableId('closeness');
const NAME_VAR = testVariableId('nameVar');
const NODE_SECRET = testVariableId('node-secret');
const VERY_CLOSE = testId('option/very-close');
const NOT_CLOSE = testId('option/not-close');
const IS_OLD = testId('condition/is-old');

const attribute = (role: AttributeDynamicValueRole, variableId: string) =>
  dynamicValueNameFor({ kind: 'attribute', role, variableId });
const labelOf = (role: LabelledDynamicValueRole) =>
  dynamicValueNameFor({ kind: 'label', role });

const EGO = {
  [NAME]: { name: 'Name', type: 'text' },
  [SECRET]: { name: 'Secret', type: 'text', encrypted: true },
  [PLACE]: { name: 'Place', type: 'location' },
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
      { id: VERY_CLOSE, value: 1, label: { en: 'Very close' } },
      { id: NOT_CLOSE, value: 'not close', label: { en: 'Not close' } },
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

const namesAt = (context: DynamicValueSiteContext) =>
  dynamicValueChoices(context).map((choice) => choice.name);

describe('dynamicValueChoices', () => {
  it('offers today’s date and the attributes text can show, and nothing else', () => {
    expect(namesAt(contextFor('Information', 'stageText'))).toEqual([
      attribute('ego', NAME),
      attribute('ego', CHILDREN),
      attribute('ego', SMOKES),
      attribute('ego', VAPES),
      attribute('ego', DRINKS),
      'now',
    ]);
  });

  it('names each value as the text writes it, by its id', () => {
    expect(attribute('ego', NAME)).toBe(`ego_${NAME.replaceAll('-', '_')}`);
    expect(namesAt(contextFor('Information', 'stageText'))).toContain(
      attribute('ego', NAME),
    );
  });

  it('lists what the text is about first, then the participant, then the interview', () => {
    const names = namesAt(contextFor('DyadCensus', 'prompt'));
    const firstEgo = names.findIndex((name) => name.startsWith('ego_'));
    expect(
      names.slice(0, firstEgo).every((name) => name.startsWith('dyad')),
    ).toBe(true);
    expect(
      names.slice(firstEgo, -1).every((name) => name.startsWith('ego_')),
    ).toBe(true);
    expect(names.at(-1)).toBe('now');
  });

  it('offers each node on screen by its label, before its attributes', () => {
    const names = namesAt(contextFor('DyadCensus', 'prompt'));
    expect(names.filter((name) => name.startsWith('dyad'))).toEqual([
      labelOf('dyadSource'),
      attribute('dyadSource', NODE_NAME),
      attribute('dyadSource', CLOSENESS),
      labelOf('dyadTarget'),
      attribute('dyadTarget', NODE_NAME),
      attribute('dyadTarget', CLOSENESS),
    ]);
    const label = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).find(
      (choice) => choice.name === labelOf('dyadSource'),
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
        .map((choice) => choice.name)
        .filter((name) => name.startsWith('node_')),
    ).toEqual([
      'node_label',
      'node_isParticipant',
      attribute('node', NODE_NAME),
      attribute('node', CLOSENESS),
    ]);
    const participant = choices.find(
      (choice) => choice.name === 'node_isParticipant',
    );
    expect(participant).toMatchObject({
      kind: 'participant',
      optional: false,
      unshowable: 'switch',
    });
    // It is worded for by whether it is true.
    expect(participant?.options.map((option) => option.caseKey)).toEqual([
      'true',
    ]);
    // Any other node form has no participant among its nodes.
    expect(namesAt(contextFor('AlterForm', 'formField', true))).not.toContain(
      'node_isParticipant',
    );
  });

  it('offers an edge form both ends of its edge by label alone', () => {
    const context: DynamicValueSiteContext = {
      roles: dynamicValueRolesAt({ type: 'AlterEdgeForm' }, 'formField', {
        entity: 'edge',
        isStageSubject: true,
      }),
      variablesFor: (role) => (role === 'ego' ? EGO : undefined),
    };
    const names = namesAt(context);
    expect(names).toContain(labelOf('edgeFrom'));
    expect(names).toContain(labelOf('edgeTo'));
    expect(names.some((name) => name.startsWith('node_'))).toBe(false);
  });

  it('offers a bin prompt in tap-to-place mode the node being placed, whose label can be missing', () => {
    const context = dynamicValueContextFor({
      codebook: {
        ego: { variables: EGO },
        node: { [PERSON]: { variables: NODE } },
      },
      stage: {
        type: 'OrdinalBin',
        subject: { entity: 'node', types: [PERSON] },
        behaviours: { interactionMode: 'select' },
      },
      sitePath: ['prompts', 0, 'text'],
      site: 'prompt',
    });
    const label = dynamicValueChoices(context).find(
      (choice) => choice.name === 'node_label',
    );
    expect(label).toMatchObject({ kind: 'label', optional: true });
  });

  it('offers no label where no single node is on screen', () => {
    expect(
      namesAt(contextFor('Sociogram', 'prompt')).some((name) =>
        name.endsWith('_label'),
      ),
    ).toBe(false);
  });

  it('chooses an option of a categorical or ordinal attribute by its id', () => {
    const closeness = dynamicValueChoices(
      contextFor('DyadCensus', 'prompt'),
    ).find((choice) => choice.name === attribute('dyadSource', CLOSENESS));
    expect(closeness?.options).toEqual([
      {
        caseKey: optionCaseKey(VERY_CLOSE),
        value: 1,
        label: { en: 'Very close' },
      },
      {
        caseKey: optionCaseKey(NOT_CLOSE),
        value: 'not close',
        label: { en: 'Not close' },
      },
    ]);
  });

  it('gives a yes-or-no attribute its two answers, labelled where its options label them', () => {
    const choices = dynamicValueChoices(contextFor('Information', 'stageText'));
    const smokes = choices.find(
      (choice) => choice.name === attribute('ego', SMOKES),
    );
    expect(smokes?.options).toEqual([
      { caseKey: 'true', value: true, label: undefined },
      { caseKey: 'false', value: false, label: undefined },
    ]);
    const drinks = choices.find(
      (choice) => choice.name === attribute('ego', DRINKS),
    );
    expect(drinks?.options).toEqual([
      { caseKey: 'true', value: true, label: { en: 'Drinks' } },
      { caseKey: 'false', value: false, label: { en: 'Does not drink' } },
    ]);
  });

  it('offers a yes-or-no attribute as words only once both answers have labels', () => {
    const unshowable = Object.fromEntries(
      dynamicValueChoices(contextFor('Information', 'stageText')).map(
        (choice) => [choice.name, choice.unshowable],
      ),
    );
    expect(unshowable).toEqual({
      now: undefined,
      [attribute('ego', NAME)]: undefined,
      [attribute('ego', CHILDREN)]: undefined,
      [attribute('ego', SMOKES)]: 'needsLabels',
      [attribute('ego', VAPES)]: 'switch',
      [attribute('ego', DRINKS)]: undefined,
    });
  });
});

describe('dynamicValueNamesUsedIn', () => {
  it('finds the names every text in a stage uses', () => {
    expect(
      [
        ...dynamicValueNamesUsedIn({
          title: { en: 'Hi {name, select, missing {there} other {{name}}}' },
          prompts: [{ text: { en: 'Since {now}', fr: "Depuis '{now}'" } }],
          label: 'Literal {braces} in a label',
        }),
      ].toSorted(),
    ).toEqual(['braces', 'name', 'now']);
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
      [IS_OLD]: {
        about: 'node',
        rules: [
          {
            id: testId('rule/is-old'),
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
        .map((choice) => choice.name),
    ).toEqual(['node_label', attribute('node', NAME_VAR)]);
    expect(
      choices.find((choice) => choice.kind === 'label')?.defaultLabel,
    ).toBe(true);
    expect(choices.some((choice) => choice.kind === 'intrinsic')).toBe(false);
    expect(choices.some((choice) => choice.role === 'ego')).toBe(false);
  });

  it('offers each condition the label declares, to be tested and never shown', () => {
    const conditions = choices.filter((choice) => choice.kind === 'condition');
    expect(conditions.map((choice) => choice.name)).toEqual([
      dynamicValueNameFor({ kind: 'condition', conditionId: IS_OLD }),
    ]);
    expect(conditions.every(isFlagChoice)).toBe(true);
    expect(conditions[0]?.unshowable).toBe('switch');
  });
});
