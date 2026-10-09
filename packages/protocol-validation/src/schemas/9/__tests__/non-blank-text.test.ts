import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import {
  EdgeDefinitionSchema,
  NodeDefinitionSchema,
} from '../codebook/definitions.ts';
import { FormFieldSchema } from '../common/forms.ts';
import { IntroductionPanelSchema } from '../common/introductionPanel.ts';
import { panelSchema } from '../common/panels.ts';
import { promptSchema } from '../common/prompts.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { anonymisationStage } from '../stages/anonymisation.ts';
import { nameGeneratorRosterStage } from '../stages/name-generator-roster.ts';
import { narrativePedigreeStage } from '../stages/narrative-pedigree.ts';
import { networkComposerStage } from '../stages/network-composer.ts';
import { ComponentTypes } from '../variables/types.ts';
import { VariableSchema } from '../variables/variable.ts';

const issuesOf = (
  schema: { safeParse: (value: unknown) => unknown },
  value: unknown,
) => {
  const result = schema.safeParse(value) as {
    success: boolean;
    error?: { issues: { message: string; path: PropertyKey[] }[] };
  };
  return result.success
    ? []
    : (result.error?.issues.map(({ message, path }) => ({ message, path })) ??
        []);
};

const BLANK_TRANSLATIONS = [
  ['spaces', '   '],
  ['a tab', '\t'],
  ['non-breaking spaces', '  '],
  ['zero-width spaces', '​'],
] as const;

describe('nonBlankText', () => {
  const required = localizedString(nonBlankText(), 'markdown');

  it('accepts a translation with text in it', () => {
    expect(required.safeParse({ en: 'How old are you?' }).success).toBe(true);
    expect(required.safeParse({ en: ' Age ' }).success).toBe(true);
  });

  it('reports an empty translation once', () => {
    expect(issuesOf(required, { en: '' })).toHaveLength(1);
  });

  it.each(BLANK_TRANSLATIONS)(
    'rejects %s, anchored at the language',
    (_n, text) => {
      expect(issuesOf(required, { en: text })).toEqual([
        { message: 'Text cannot be blank.', path: ['en'] },
      ]);
    },
  );

  it('rejects one blank translation even when another has text', () => {
    expect(issuesOf(required, { en: 'Age', fr: '  ' })).toEqual([
      { message: 'Text cannot be blank.', path: ['fr'] },
    ]);
  });
});

describe('a form field prompt', () => {
  const field = (prompt: Record<string, string>) => ({
    variable: 'age',
    prompt,
  });

  it('accepts a prompt with text in every translation', () => {
    expect(
      FormFieldSchema.safeParse(field({ en: 'Age?', fr: 'Âge ?' })).success,
    ).toBe(true);
  });

  it.each(BLANK_TRANSLATIONS)('rejects a prompt of %s', (_n, text) => {
    expect(
      issuesOf(FormFieldSchema, field({ en: text })).map(({ path }) => path),
    ).toContainEqual(['prompt', 'en']);
  });

  it('rejects a blank translation beside a translation with text', () => {
    expect(
      issuesOf(FormFieldSchema, field({ en: 'Age?', fr: ' ' })).map(
        ({ path }) => path,
      ),
    ).toEqual([['prompt', 'fr']]);
  });

  it('still lets the hint be empty', () => {
    expect(
      FormFieldSchema.safeParse({
        ...field({ en: 'Age?' }),
        hint: { en: '' },
      }).success,
    ).toBe(true);
  });
});

describe('a Network Composer field caption', () => {
  it('rejects a caption of spaces, anchored at its label', () => {
    const result = networkComposerStage.safeParse({
      id: 'composer',
      type: 'NetworkComposer',
      label: localized('Compose'),
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layout',
      background: { concentricCircles: 4 },
      edges: [],
      nodeForm: {
        fields: [
          {
            variable: 'age',
            label: { en: '   ' },
            component: ComponentTypes.Number,
          },
        ],
      },
    });
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'nodeForm',
      'fields',
      0,
      'label',
      'en',
    ]);
  });
});

const rosterStage = {
  id: 'roster',
  type: 'NameGeneratorRoster',
  externalDataError: localized('External data could not be loaded.'),
  allAddedNotice: localized('There is nothing left to add from this list.'),
  label: localized('Roster'),
  subject: { entity: 'node', type: 'person' },
  dataSource: 'rosterAsset',
  panelTitle: localized('People'),
  prompts: [{ id: 'p', text: localized('Who do you know?') }],
};

// Every required participant-facing string these schemas hold, each with a
// value that is valid as given and the path of the string inside it.
const REQUIRED_TEXT_SITES: readonly {
  name: string;
  schema: { safeParse: (value: unknown) => unknown };
  valid: (text: Record<string, string>) => unknown;
  path: readonly PropertyKey[];
}[] = [
  {
    name: 'a prompt',
    schema: promptSchema,
    valid: (text) => ({ id: 'p', text }),
    path: ['text'],
  },
  {
    name: 'a panel title',
    schema: panelSchema,
    valid: (title) => ({ id: 'panel', title, dataSource: 'existing' }),
    path: ['title'],
  },
  {
    name: 'an introduction panel title',
    schema: IntroductionPanelSchema,
    valid: (title) => ({ title, text: localized('Tell us about them') }),
    path: ['title'],
  },
  {
    name: 'an anonymisation explanation title',
    schema: anonymisationStage,
    valid: (title) => ({
      id: 'anon',
      type: 'Anonymisation',
      label: localized('Anonymisation'),
      explanationText: { title, body: localized('Choose a passphrase.') },
    }),
    path: ['explanationText', 'title'],
  },
  {
    name: 'an anonymisation explanation body',
    schema: anonymisationStage,
    valid: (body) => ({
      id: 'anon',
      type: 'Anonymisation',
      label: localized('Anonymisation'),
      explanationText: { title: localized('Privacy'), body },
    }),
    path: ['explanationText', 'body'],
  },
  {
    name: 'a node type label',
    schema: NodeDefinitionSchema,
    valid: (label) => ({
      name: 'Person',
      label,
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
    }),
    path: ['label'],
  },
  {
    name: 'an edge type label',
    schema: EdgeDefinitionSchema,
    valid: (label) => ({ name: 'Knows', label }),
    path: ['label'],
  },
  {
    name: 'a roster card property label',
    schema: nameGeneratorRosterStage,
    valid: (label) => ({
      ...rosterStage,
      cardOptions: { additionalProperties: [{ label, variable: 'age' }] },
    }),
    path: ['cardOptions', 'additionalProperties', 0, 'label'],
  },
  {
    name: 'a roster sortable property label',
    schema: nameGeneratorRosterStage,
    valid: (label) => ({
      ...rosterStage,
      sortOptions: { sortableProperties: [{ label, variable: 'age' }] },
    }),
    path: ['sortOptions', 'sortableProperties', 0, 'label'],
  },
  {
    name: 'a narrative pedigree disease label',
    schema: narrativePedigreeStage,
    valid: (label) => ({
      id: 'narrative',
      type: 'NarrativePedigree',
      label: localized('Family health'),
      sourceStageId: 'pedigree',
      diseases: [
        {
          id: 'disease',
          label,
          color: 'node-color-seq-1',
          attribute: 'hasCondition',
          inheritancePattern: 'autosomalDominant',
        },
      ],
    }),
    path: ['diseases', 0, 'label'],
  },
];

describe.each(REQUIRED_TEXT_SITES)('$name', ({ schema, valid, path }) => {
  it('accepts text', () => {
    expect(issuesOf(schema, valid({ en: 'Text' }))).toEqual([]);
  });

  it.each(BLANK_TRANSLATIONS)(
    'rejects %s, anchored at the language',
    (_n, text) => {
      expect(issuesOf(schema, valid({ en: text }))).toContainEqual({
        message: 'Text cannot be blank.',
        path: [...path, 'en'],
      });
    },
  );
});

// The variable schema is a union of every variable type, so a refusal is
// reported as the union's; whether the variable parses is what is asked.
describe('option labels', () => {
  const booleanVariable = (label: Record<string, string>) => ({
    name: 'Smokes',
    label: 'Smokes',
    type: 'boolean',
    component: ComponentTypes.Boolean,
    options: [
      { label, value: true },
      { label: localized('No'), value: false },
    ],
  });
  const categoricalVariable = (label: Record<string, string>) => ({
    name: 'Colour',
    label: 'Colour',
    type: 'categorical',
    options: [
      { label, value: 'red' },
      { label: localized('Blue'), value: 'blue' },
    ],
  });

  it.each([
    ['a Boolean choice', booleanVariable],
    ['a categorical option', categoricalVariable],
  ])('%s accepts a label with text', (_n, variable) => {
    expect(VariableSchema.safeParse(variable({ en: 'Red' })).success).toBe(
      true,
    );
  });

  it.each([
    ['a Boolean choice', '', booleanVariable],
    ['a Boolean choice', '   ', booleanVariable],
    ['a categorical option', '', categoricalVariable],
    ['a categorical option', '   ', categoricalVariable],
  ])('%s rejects the label %j', (_n, text, variable) => {
    expect(
      VariableSchema.safeParse(variable({ en: 'Red', fr: text })).success,
    ).toBe(false);
  });
});
