import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  collectLocalizedStrings,
  type CurrentProtocol,
  CurrentProtocolSchema,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';

import { stageEditorRegistry } from '../../stageEditorRegistry.ts';
import { enIntl } from '../../testing/i18n.ts';
import { nameLocalizedText } from '../localizedTextNames.ts';

type Path = readonly (string | number)[];

const en = (text: string) => ({ 'en-US': text });

const fixtureStage = (type: string): Path => {
  const index = allInterfaces.stages.findIndex((stage) => stage.type === type);
  if (index < 0) throw new Error(`The fixture has no ${type} stage.`);
  return ['stages', index];
};

const scaleVariable = (name: string, minLabel: string, maxLabel: string) => ({
  name,
  label: name,
  type: 'scalar',
  component: 'VisualAnalogScale',
  parameters: { minLabel: en(minLabel), maxLabel: en(maxLabel) },
});

const composerScaleField = (variable: string, label: string) => ({
  variable,
  component: 'VisualAnalogScale',
  label: en(label),
  hint: en('Drag the slider.'),
  parameters: { minLabel: en('Not at all'), maxLabel: en('Completely') },
});

const panel = {
  id: 'panel-1',
  title: en('People named'),
  dataSource: 'existing',
};

/**
 * Every localized field the all-interfaces fixture leaves empty, filled, so
 * that each one the schema declares appears at least once. Two variables are
 * renamed so that a label shows it reads the codebook name, not the id.
 */
const ADDITIONS: readonly (readonly [Path, unknown])[] = [
  [
    ['assetManifest', 'picture'],
    { type: 'image', name: 'Picture', source: 'picture.png' },
  ],
  [
    ['codebook', 'node', 'person', 'variables', 'flagged', 'name'],
    'Flag for follow-up',
  ],
  [
    ['codebook', 'node', 'person', 'variables', 'contactType', 'name'],
    'Contact type',
  ],
  [
    ['codebook', 'node', 'person', 'variables', 'flagged', 'options'],
    [
      { label: en('Flagged'), value: true },
      { label: en('Not flagged'), value: false },
    ],
  ],
  [
    ['codebook', 'node', 'person', 'variables', 'warmth'],
    scaleVariable('Warmth', 'Cold', 'Warm'),
  ],
  [
    ['codebook', 'node', 'person', 'variables', 'contactOther'],
    { name: 'contactOther', label: 'Other', type: 'text', component: 'Text' },
  ],
  [
    ['codebook', 'node', 'family_member', 'variables', 'fm_occupation'],
    {
      name: 'Occupation',
      label: 'Occupation',
      type: 'text',
      component: 'Text',
    },
  ],
  [
    ['codebook', 'edge', 'knows', 'variables', 'bond'],
    scaleVariable('Bond', 'Weak', 'Strong'),
  ],
  [
    ['codebook', 'ego', 'variables', 'ego_mood'],
    {
      name: 'Mood',
      label: 'Mood',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: en('Calm'), value: 'calm' },
        { label: en('Busy'), value: 'busy' },
      ],
    },
  ],
  [
    ['codebook', 'ego', 'variables', 'ego_energy'],
    scaleVariable('Energy', 'Tired', 'Rested'),
  ],
  [
    [...fixtureStage('EgoForm'), 'form', 'fields', 0, 'hint'],
    en('Your first name is enough.'),
  ],
  [
    [...fixtureStage('Information'), 'items', 1],
    {
      id: 'information-picture',
      type: 'asset',
      content: 'picture',
      description: en('A picture'),
    },
  ],
  [
    [...fixtureStage('NameGenerator'), 'form', 'fields', 0, 'hint'],
    en('A first name is enough.'),
  ],
  [[...fixtureStage('NameGenerator'), 'panels'], [panel]],
  [[...fixtureStage('NameGeneratorQuickAdd'), 'panels'], [panel]],
  // The messages a name generator shows around its limits and its panels,
  // and a map's search messages, which the fixture leaves unset.
  ...(['NameGenerator', 'NameGeneratorQuickAdd'] as const).flatMap(
    (type) =>
      [
        [
          [...fixtureStage(type), 'minNodesNotice'],
          en('You must name more people.'),
        ],
        [
          [...fixtureStage(type), 'maxNodesNotice'],
          en('You have named enough people.'),
        ],
        [
          [...fixtureStage(type), 'externalDataError'],
          en('The list could not be loaded.'),
        ],
      ] as const,
  ),
  [[...fixtureStage('Geospatial'), 'mapOptions', 'allowSearch'], true],
  [[...fixtureStage('Geospatial'), 'searchLabel'], en('Search places')],
  [[...fixtureStage('Geospatial'), 'searchNoMatch'], en('No place matches.')],
  [[...fixtureStage('Geospatial'), 'searchFailed'], en('The search failed.')],
  [
    [...fixtureStage('CategoricalBin'), 'prompts', 0, 'otherVariable'],
    'contactOther',
  ],
  [
    [...fixtureStage('CategoricalBin'), 'prompts', 0, 'otherVariablePrompt'],
    en('What kind of contact?'),
  ],
  [
    [...fixtureStage('CategoricalBin'), 'prompts', 0, 'otherOptionLabel'],
    en('Something else'),
  ],
  [
    [...fixtureStage('AlterForm'), 'form', 'fields', 0, 'hint'],
    en('Answer as best you can.'),
  ],
  [
    [...fixtureStage('AlterEdgeForm'), 'form', 'fields', 0, 'hint'],
    en('Answer as best you can.'),
  ],
  [
    [...fixtureStage('FamilyPedigree'), 'form'],
    {
      fields: [
        {
          variable: 'fm_occupation',
          prompt: en('What do they do?'),
          hint: en('Their main work.'),
        },
      ],
    },
  ],
  [
    ['codebook', 'node', 'family_member', 'variables', 'relativesNotRecorded'],
    {
      name: 'relativesNotRecorded',
      label: 'relativesNotRecorded',
      type: 'categorical',
      options: PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS.map(
        ({ value, label }) => ({ value, label: en(label) }),
      ),
    },
  ],
  // The wording questions show only while participants choose the words, so
  // the fixture chooses them for the pattern check to reach their rules.
  [[...fixtureStage('FamilyPedigree'), 'framing'], 'participantPreference'],
  [
    [...fixtureStage('FamilyPedigree'), 'wording', 'framingChoiceTitle'],
    en('How should we describe your family?'),
  ],
  [
    [...fixtureStage('FamilyPedigree'), 'wording', 'framingChoiceDescription'],
    en('Choose the words you would like us to use for your family.'),
  ],
  [
    [...fixtureStage('FamilyPedigree'), 'wording', 'framingControlLabel'],
    en('Wording'),
  ],
  // The note under the family tree shows only while a question about the
  // family is limited to one sex at birth, so the fixture limits its question.
  [
    [
      ...fixtureStage('FamilyPedigree'),
      'nominationPrompts',
      0,
      'onlyForSexAssignedAtBirth',
    ],
    'female',
  ],
  [
    [...fixtureStage('FamilyPedigree'), 'wording', 'nominationLimitHint'],
    en(
      '{sex, select, female {People assigned male at birth can’t be selected.} other {People assigned female at birth can’t be selected.}}',
    ),
  ],
  [
    [...fixtureStage('FamilyPedigree'), 'completeness'],
    {
      scope: 'firstDegree',
      enforcement: 'recommended',
      relativesNotRecordedAttribute: 'relativesNotRecorded',
      itemText: {
        parents: { listItem: en('Add parents') },
        siblings: {
          listItem: en('Add brothers and sisters'),
          noneButton: en('None'),
          question: en('Any brothers or sisters?'),
        },
        children: {
          listItem: en('Add children'),
          noneButton: en('None'),
          question: en('Any children?'),
        },
        details: { listItem: en('Some details are missing') },
      },
      recommendedNote: en('You can continue without these.'),
    },
  ],
  // Every rule's message, which the fixture's own rules do not all need.
  [
    ['interfaceText', 'validation'],
    Object.fromEntries(
      [
        'required',
        'minLength',
        'maxLength',
        'minValue',
        'maxValue',
        'minDate',
        'maxDate',
        'minSelected',
        'maxSelected',
        'unique',
        'differentFrom',
        'sameAs',
        'greaterThan',
        'lessThan',
        'greaterThanOrEqual',
        'lessThanOrEqual',
      ].map((rule) => [rule, en(`The ${rule} message.`)]),
    ),
  ],
  [
    [...fixtureStage('NetworkComposer'), 'nodeForm'],
    { fields: [composerScaleField('warmth', 'How warm are they?')] },
  ],
  [
    [...fixtureStage('NetworkComposer'), 'edges'],
    [
      {
        id: 'composer-knows',
        subject: { entity: 'edge', type: 'knows' },
        form: { fields: [composerScaleField('bond', 'How strong is it?')] },
      },
    ],
  ],
  // A composer with a connection type holds the tooltip of the tool that draws it.
  [
    [...fixtureStage('NetworkComposer'), 'tooltips', 'drawConnection'],
    { 'en-US': 'Draw edge' },
  ],
  // Each setting a configuration switches on is held once that configuration is
  // on, so the fixture exercises it: grouping, automatic layout and at-risk
  // statuses.
  [[...fixtureStage('NetworkComposer'), 'convexHullVariable'], 'contactType'],
  [[...fixtureStage('NetworkComposer'), 'groupsHeading'], en('Groups')],
  [[...fixtureStage('Narrative'), 'behaviours', 'automaticLayout'], true],
  [
    [...fixtureStage('Narrative'), 'tooltips', 'pauseLayout'],
    en('Pause automatic layout'),
  ],
  [
    [...fixtureStage('Narrative'), 'tooltips', 'resumeLayout'],
    en('Resume automatic layout'),
  ],
  [[...fixtureStage('NarrativePedigree'), 'showAtRiskStatuses'], true],
  [
    [
      ...fixtureStage('NarrativePedigree'),
      'conditionText',
      'notation',
      'atRiskAffected',
    ],
    en('May develop this condition'),
  ],
  [
    [
      ...fixtureStage('NarrativePedigree'),
      'conditionText',
      'notation',
      'atRiskCarrier',
    ],
    en('May carry this condition'),
  ],
];

const setAt = (root: unknown, path: Path, value: unknown): void => {
  const parent = path
    .slice(0, -1)
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? Reflect.get(node, key)
          : undefined,
      root,
    );
  const key = path.at(-1);
  if (typeof parent !== 'object' || parent === null || key === undefined) {
    throw new Error(`Nothing holds ${JSON.stringify(path)}.`);
  }
  Reflect.set(parent, key, value);
};

const augmentedProtocol = (): CurrentProtocol => {
  const document: unknown = structuredClone(allInterfaces);
  for (const [path, value] of ADDITIONS) setAt(document, path, value);
  return CurrentProtocolSchema.parse(document);
};

const protocol = augmentedProtocol();

const stageAt = (type: string): Path => {
  const index = protocol.stages.findIndex((stage) => stage.type === type);
  if (index < 0) throw new Error(`The protocol has no ${type} stage.`);
  return ['stages', index];
};

const isLocalized = (schema: z.ZodType): boolean =>
  schema.meta()?.localizedString !== undefined;

// The wrappers `collectLocalizedStrings` reads through, read through the same
// way, so the two walks agree on where a localized string sits.
const unwrap = (schema: z.ZodType): z.ZodType => {
  if (isLocalized(schema)) return schema;
  let inner: unknown;
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodNonOptional ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodCatch
  ) {
    inner = schema.def.innerType;
  } else if (schema instanceof z.ZodLazy) {
    inner = schema.def.getter();
  } else if (schema instanceof z.ZodPipe) {
    inner = schema.in;
  }
  return inner instanceof z.ZodType ? unwrap(inner) : schema;
};

const POSITION = '#';
const KEY = '*';

const stageTypeOf = (option: z.ZodType): string | undefined => {
  const node = unwrap(option);
  const type: unknown =
    node instanceof z.ZodObject ? node.shape.type : undefined;
  return type instanceof z.ZodLiteral && typeof type.value === 'string'
    ? type.value
    : undefined;
};

/**
 * Every place the schema declares a localized string, as a pattern: `#` for a
 * list position, `*` for a record key, and a stage's type in place of its
 * position in the stage list.
 */
const schemaPatterns = (
  schema: z.ZodType,
  path: readonly string[] = [],
  seen: ReadonlySet<z.ZodType> = new Set(),
): string[] => {
  const node = unwrap(schema);
  if (isLocalized(node)) return [path.join('.')];
  if (seen.has(node)) return [];
  const within = new Set(seen).add(node);
  const follow = (child: unknown, segment: string) =>
    child instanceof z.ZodType
      ? schemaPatterns(child, [...path, segment], within)
      : [];
  if (node instanceof z.ZodObject) {
    return Object.entries(node.shape).flatMap(([key, child]) =>
      follow(child, key),
    );
  }
  if (node instanceof z.ZodArray) return follow(node.element, POSITION);
  if (node instanceof z.ZodRecord) return follow(node.valueType, KEY);
  if (node instanceof z.ZodUnion) {
    const inStageList = path.join('.') === `stages.${POSITION}`;
    return node.options.flatMap((option) => {
      if (!(option instanceof z.ZodType)) return [];
      const stageType = inStageList ? stageTypeOf(option) : undefined;
      return stageType === undefined
        ? schemaPatterns(option, path, within)
        : schemaPatterns(option, ['stages', stageType], within);
    });
  }
  return [];
};

/** The pattern a concrete path matches, read off the schema along it. */
const patternAlong = (schema: z.ZodType, path: Path): string[] | undefined => {
  const node = unwrap(schema);
  const [segment, ...rest] = path;
  if (segment === undefined) return isLocalized(node) ? [] : undefined;
  const follow = (child: unknown, token: string) => {
    if (!(child instanceof z.ZodType)) return undefined;
    const tail = patternAlong(child, rest);
    return tail && [token, ...tail];
  };
  if (node instanceof z.ZodObject && typeof segment === 'string') {
    return follow(node.shape[segment], segment);
  }
  if (node instanceof z.ZodArray && typeof segment === 'number') {
    return follow(node.element, POSITION);
  }
  if (node instanceof z.ZodRecord && typeof segment === 'string') {
    return follow(node.valueType, KEY);
  }
  if (node instanceof z.ZodUnion) {
    for (const option of node.options) {
      if (!(option instanceof z.ZodType)) continue;
      const found = patternAlong(option, path);
      if (found) return found;
    }
  }
  return undefined;
};

const patternOf = (path: Path): string => {
  const pattern = patternAlong(CurrentProtocolSchema, path);
  if (!pattern) throw new Error(`${JSON.stringify(path)} is not localized.`);
  const [root, position] = path;
  if (root === 'stages' && typeof position === 'number') {
    pattern[1] = protocol.stages[position]?.type ?? POSITION;
  }
  return pattern.join('.');
};

// A label that repeats a segment of its own schema path, holds an unformatted
// placeholder, or is a bare number is the schema showing through.
const looksRaw = (label: string, pattern: string): boolean =>
  label.trim() === '' ||
  label.includes('{') ||
  /^\d+$/u.test(label) ||
  pattern
    .split('.')
    .some(
      (segment) => segment !== POSITION && segment !== KEY && segment === label,
    );

const name = (path: Path) => nameLocalizedText(enIntl, protocol, path);

describe('nameLocalizedText', () => {
  const hits = collectLocalizedStrings(protocol);

  it('reads the schema through the same zod the protocol is built with', () => {
    expect(CurrentProtocolSchema).toBeInstanceOf(z.ZodType);
  });

  it('exercises every pattern the schema declares', () => {
    const declared = [...new Set(schemaPatterns(CurrentProtocolSchema))];
    const exercised = [...new Set(hits.map(({ path }) => patternOf(path)))];
    expect(exercised.toSorted()).toEqual(declared.toSorted());
  });

  it('exercises every interface the stage editors register', () => {
    const fixtureTypes: ReadonlySet<string> = new Set(
      protocol.stages.map((stage) => stage.type),
    );
    const missing = Object.keys(stageEditorRegistry).filter(
      (type) => !fixtureTypes.has(type),
    );
    expect(missing).toEqual([]);
  });

  it('names every localized text in human words', () => {
    const unnamed = hits.flatMap(({ path }) => {
      const pattern = patternOf(path);
      const steps = name(path);
      if (!steps || steps.length === 0) return [`${pattern}: no steps`];
      return steps
        .filter(({ label }) => looksRaw(label, pattern))
        .map(({ key, label }) => `${pattern}: ${key} reads “${label}”`);
    });
    expect(unnamed).toEqual([]);
  });

  it('names a stage label', () => {
    expect(name([...stageAt('Anonymisation'), 'label'])).toEqual([
      { key: '["label"]', label: 'Stage name' },
    ]);
  });

  it('names the words of a pedigree’s list by the group they sit in', () => {
    expect(
      name([
        ...stageAt('FamilyPedigree'),
        'completeness',
        'itemText',
        'siblings',
        'noneButton',
      ]),
    ).toEqual([
      { key: '[]', label: 'Completeness' },
      { key: '["completeness"]', label: 'What the list says' },
      {
        key: '["completeness","itemText","siblings","noneButton"]',
        label: 'No brothers or sisters',
      },
    ]);
    expect(
      name([
        ...stageAt('FamilyPedigree'),
        'nodeConfiguration',
        'nameField',
        'hint',
      ]),
    ).toEqual([
      { key: '[]', label: 'Person attributes' },
      {
        key: '["nodeConfiguration","nameField","hint"]',
        label: 'Name question guidance',
      },
    ]);
  });

  it('names a prompt text by its section, position and field', () => {
    expect(name([...stageAt('NameGenerator'), 'prompts', 0, 'text'])).toEqual([
      { key: '["prompts"]', label: 'Prompt collection' },
      { key: '["prompts",0]', label: 'Prompt 1' },
      { key: '["prompts",0,"text"]', label: 'Prompt text' },
    ]);
  });

  it('names an introduction title', () => {
    expect(name([...stageAt('EgoForm'), 'introductionPanel', 'title'])).toEqual(
      [
        { key: '["introductionPanel"]', label: 'Task introduction' },
        { key: '["introductionPanel","title"]', label: 'Title' },
      ],
    );
  });

  it('names a form field question by the attribute it records', () => {
    expect(
      name([...stageAt('AlterForm'), 'form', 'fields', 1, 'prompt']),
    ).toEqual([
      { key: '["form"]', label: 'Form configuration' },
      { key: '["form","fields",1]', label: 'Flag for follow-up' },
      { key: '["form","fields",1,"prompt"]', label: 'Question text' },
    ]);
  });

  it('names a codebook option label', () => {
    expect(
      name([
        'codebook',
        'node',
        'person',
        'variables',
        'contactType',
        'options',
        1,
        'label',
      ]),
    ).toEqual([
      { key: '["variables","contactType"]', label: 'Contact type' },
      {
        key: '["variables","contactType","options",1,"label"]',
        label: 'Option 2 label',
      },
    ]);
  });

  it('names a codebook scalar minimum label', () => {
    expect(
      name([
        'codebook',
        'node',
        'person',
        'variables',
        'warmth',
        'parameters',
        'minLabel',
      ]),
    ).toEqual([
      { key: '["variables","warmth"]', label: 'Warmth' },
      {
        key: '["variables","warmth","parameters","minLabel"]',
        label: 'Minimum label',
      },
    ]);
  });

  it('names a Narrative highlight label by the attribute it highlights', () => {
    expect(
      name([...stageAt('Narrative'), 'presets', 0, 'highlight', 0, 'label']),
    ).toEqual([
      { key: '["presets"]', label: 'Visualization presets' },
      { key: '["presets",0]', label: 'Preset 1' },
      {
        key: '["presets",0,"highlight",0,"label"]',
        label: 'Label for “Flag for follow-up”',
      },
    ]);
  });

  it('gives two texts under one prompt the same leading steps', () => {
    const tieStrength = stageAt('TieStrengthCensus');
    const text = name([...tieStrength, 'prompts', 0, 'text']);
    const decline = name([...tieStrength, 'prompts', 0, 'negativeLabel']);
    expect(text?.slice(0, 2)).toEqual(decline?.slice(0, 2));
    expect(text?.at(-1)).toEqual({
      key: '["prompts",0,"text"]',
      label: 'Prompt text',
    });
    expect(decline?.at(-1)).toEqual({
      key: '["prompts",0,"negativeLabel"]',
      label: 'Decline option',
    });
  });

  it.each<{ path: Path }>([
    { path: ['name'] },
    { path: ['stages', 999, 'label'] },
    { path: [...stageAt('Anonymisation'), 'prompts', 0, 'text'] },
    { path: ['codebook', 'node', 'nobody', 'label'] },
    { path: ['codebook', 'ego', 'label'] },
  ])('returns undefined for the unknown path $path', ({ path }) => {
    expect(name(path)).toBeUndefined();
  });
});
