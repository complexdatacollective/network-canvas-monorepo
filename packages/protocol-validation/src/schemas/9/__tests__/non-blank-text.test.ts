import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import {
  EdgeDefinitionSchema,
  NodeDefinitionSchema,
} from '../codebook/definitions.ts';
import { FormFieldSchema, FormSchema } from '../common/forms.ts';
import { panelSchema } from '../common/panels.ts';
import { promptSchema } from '../common/prompts.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { anonymisationStage } from '../stages/anonymisation.ts';
import { familyPedigreeStage } from '../stages/family-pedigree.ts';
import { informationStage } from '../stages/information.ts';
import { nameGeneratorRosterStage } from '../stages/name-generator-roster.ts';
import { narrativePedigreeStage } from '../stages/narrative-pedigree.ts';
import { narrativeStage } from '../stages/narrative.ts';
import { networkComposerStage } from '../stages/network-composer.ts';
import { ComponentTypes } from '../variables/types.ts';
import { VariableSchema } from '../variables/variable.ts';
import {
  narrativePedigreeWords,
  networkComposerWords,
} from './canvas-stage-words.ts';

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

  it('needs no hint', () => {
    expect(issuesOf(FormFieldSchema, field({ en: 'Age?' }))).toEqual([]);
  });

  // A blank translation would be chosen over falling back to another
  // language, and show no hint in that language.
  it.each([['empty text', ''] as const, ...BLANK_TRANSLATIONS])(
    'rejects a hint translation of %s',
    (_n, text) => {
      expect(
        issuesOf(FormFieldSchema, {
          ...field({ en: 'Age?' }),
          hint: { en: 'Say if unsure.', fr: text },
        }).map(({ path }) => path),
      ).toContainEqual(['hint', 'fr']);
    },
  );
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
      ...networkComposerWords(),
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
      ...narrativePedigreeWords(),
    }),
    path: ['diseases', 0, 'label'],
  },
  {
    name: 'a Name Generator or Ego Form form title',
    schema: FormSchema,
    valid: (title) => ({
      title,
      fields: [{ variable: 'name', prompt: localized('Name?') }],
    }),
    path: ['title'],
  },
  {
    name: 'an Information text item',
    schema: informationStage,
    valid: (content) => ({
      id: 'info',
      type: 'Information',
      label: localized('Welcome'),
      title: localized('Welcome'),
      items: [{ id: 'item', type: 'text', content }],
    }),
    path: ['items', 0, 'content'],
  },
  // Optional, but text that is given must say something in every language.
  {
    name: 'an Information media description',
    schema: informationStage,
    valid: (description) => ({
      id: 'info',
      type: 'Information',
      label: localized('Welcome'),
      title: localized('Welcome'),
      items: [{ id: 'item', type: 'asset', content: 'image', description }],
    }),
    path: ['items', 0, 'description'],
  },
];

const composerField = (field: Record<string, unknown>) => ({
  id: 'composer',
  type: 'NetworkComposer',
  label: localized('Compose'),
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  background: { concentricCircles: 4 },
  edges: [],
  ...networkComposerWords(),
  nodeForm: {
    fields: [{ variable: 'age', label: localized('Age'), ...field }],
  },
});

// Stages too large to build valid by hand here: each is checked only for the
// refusal of a blank translation at the string's own path.
const BLANK_REFUSED_SITES: readonly {
  name: string;
  schema: { safeParse: (value: unknown) => unknown };
  holding: (text: Record<string, string>) => unknown;
  path: readonly PropertyKey[];
}[] = [
  {
    name: 'a Narrative preset label',
    schema: narrativeStage,
    holding: (label) => ({
      id: 'narrative',
      type: 'Narrative',
      label: localized('Narrative'),
      subject: { entity: 'node', type: 'person' },
      presets: [{ id: 'preset', label, layoutVariable: 'layout' }],
    }),
    path: ['presets', 0, 'label'],
  },
  {
    name: 'a Narrative highlight label',
    schema: narrativeStage,
    holding: (label) => ({
      id: 'narrative',
      type: 'Narrative',
      label: localized('Narrative'),
      subject: { entity: 'node', type: 'person' },
      presets: [
        {
          id: 'preset',
          label: localized('Preset 1'),
          layoutVariable: 'layout',
          highlight: [{ variable: 'close', label }],
        },
      ],
    }),
    path: ['presets', 0, 'highlight', 0, 'label'],
  },
  {
    name: 'a Family Pedigree prompt',
    schema: familyPedigreeStage,
    holding: (prompt) => ({
      id: 'pedigree',
      type: 'FamilyPedigree',
      label: localized('Family'),
      subject: { entity: 'node', type: 'person' },
      prompt,
    }),
    path: ['prompt'],
  },
  {
    name: 'a Family Pedigree question about the family',
    schema: familyPedigreeStage,
    holding: (text) => ({
      id: 'pedigree',
      type: 'FamilyPedigree',
      label: localized('Family'),
      subject: { entity: 'node', type: 'person' },
      prompt: localized('Who is in your family?'),
      nominationPrompts: [{ id: 'q', text, attribute: 'hasCondition' }],
    }),
    path: ['nominationPrompts', 0, 'text'],
  },
  {
    name: 'a Network Composer field hint',
    schema: networkComposerStage,
    holding: (hint) =>
      composerField({ component: ComponentTypes.Number, hint }),
    path: ['nodeForm', 'fields', 0, 'hint'],
  },
  {
    name: 'a Network Composer scale end label',
    schema: networkComposerStage,
    holding: (minLabel) =>
      composerField({
        component: ComponentTypes.VisualAnalogScale,
        parameters: { minLabel },
      }),
    path: ['nodeForm', 'fields', 0, 'parameters', 'minLabel'],
  },
];

describe.each(BLANK_REFUSED_SITES)('$name', ({ schema, holding, path }) => {
  it.each(BLANK_TRANSLATIONS)(
    'rejects a translation of %s beside one with text',
    (_n, text) => {
      expect(
        issuesOf(schema, holding({ en: 'Text', fr: text })),
      ).toContainEqual({
        message: 'Text cannot be blank.',
        path: [...path, 'fr'],
      });
    },
  );
});

describe('a scale attribute end label', () => {
  const scale = (maxLabel: Record<string, string>) => ({
    name: 'Closeness',
    label: 'Closeness',
    type: 'scalar',
    component: ComponentTypes.VisualAnalogScale,
    parameters: { minLabel: localized('Not close'), maxLabel },
  });

  it('accepts a label with text', () => {
    expect(VariableSchema.safeParse(scale({ en: 'Very close' })).success).toBe(
      true,
    );
  });

  it.each(BLANK_TRANSLATIONS)('rejects a translation of %s', (_n, text) => {
    expect(
      VariableSchema.safeParse(scale({ en: 'Very close', fr: text })).success,
    ).toBe(false);
  });
});

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
