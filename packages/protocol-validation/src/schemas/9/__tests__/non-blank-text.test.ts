import { describe, expect, it } from 'vitest';

import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { testId } from '../../../__tests__/testIds.ts';
import { localized } from '../../../utils/test-utils.ts';
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
import { narrativePedigreeWords } from './canvas-stage-words.ts';

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
  const required = localizedString(nonBlankText(), {
    format: 'markdown',
    lines: 'single',
  });

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
    id: testId('field-age'),
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
      id: testId('composer'),
      type: 'NetworkComposer',
      label: localized('Compose'),
      subject: { entity: 'node', types: ['person'] },
      quickAdd: 'name',
      layoutVariable: 'layout',
      background: { concentricCircles: 4 },
      edges: [],
      nodeForm: {
        fields: [
          {
            id: testId('field-1'),
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
  id: testId('roster'),
  type: 'NameGeneratorRoster',
  allAddedNotice: localized('There is nothing left to add from this list.'),
  unnamedLabel: localized('Unnamed {count}'),
  label: localized('Roster'),
  subject: { entity: 'node', types: ['person'] },
  dataSource: 'rosterAsset',
  panelTitle: localized('People'),
  prompts: [{ id: testId('p'), text: localized('Who do you know?') }],
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
    valid: (text) => ({ id: testId('p'), text }),
    path: ['text'],
  },
  {
    name: 'a panel title',
    schema: panelSchema,
    valid: (title) => ({ id: testId('panel'), title, dataSource: 'existing' }),
    path: ['title'],
  },
  {
    name: 'an anonymisation explanation',
    schema: anonymisationStage,
    valid: (explanationText) => ({
      id: testId('anon'),
      type: 'Anonymisation',
      label: localized('Anonymisation'),
      explanationText,
    }),
    path: ['explanationText'],
  },
  {
    name: 'a roster card property label',
    schema: nameGeneratorRosterStage,
    valid: (label) => ({
      ...rosterStage,
      cardOptions: {
        additionalProperties: [
          { id: testId('card-age'), label, variable: 'age' },
        ],
      },
    }),
    path: ['cardOptions', 'additionalProperties', 0, 'label'],
  },
  {
    name: 'a roster sortable property label',
    schema: nameGeneratorRosterStage,
    valid: (label) => ({
      ...rosterStage,
      sortOptions: {
        sortableProperties: [
          { id: testId('sort-age'), label, variable: 'age' },
        ],
      },
    }),
    path: ['sortOptions', 'sortableProperties', 0, 'label'],
  },
  {
    name: 'a narrative pedigree disease label',
    schema: narrativePedigreeStage,
    valid: (label) => ({
      id: testId('narrative'),
      type: 'NarrativePedigree',
      label: localized('Family health'),
      sourceStageId: testId('pedigree'),
      diseases: [
        {
          id: testId('disease'),
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
      fields: [
        { id: testId('field-1'), variable: 'name', prompt: localized('Name?') },
      ],
    }),
    path: ['title'],
  },
  {
    name: 'an Information page',
    schema: informationStage,
    valid: (content) => ({
      id: testId('info'),
      type: 'Information',
      label: localized('Welcome'),
      content,
    }),
    path: ['content'],
  },
];

const composerField = (field: Record<string, unknown>) => ({
  id: testId('composer'),
  type: 'NetworkComposer',
  label: localized('Compose'),
  subject: { entity: 'node', types: ['person'] },
  quickAdd: 'name',
  layoutVariable: 'layout',
  background: { concentricCircles: 4 },
  edges: [],
  nodeForm: {
    fields: [
      {
        id: testId('field-age'),
        variable: 'age',
        label: localized('Age'),
        ...field,
      },
    ],
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
      id: testId('narrative'),
      type: 'Narrative',
      label: localized('Narrative'),
      subject: { entity: 'node', types: ['person'] },
      presets: [{ id: testId('preset'), label, layoutVariable: 'layout' }],
    }),
    path: ['presets', 0, 'label'],
  },
  {
    name: 'a Narrative highlight label',
    schema: narrativeStage,
    holding: (label) => ({
      id: testId('narrative'),
      type: 'Narrative',
      label: localized('Narrative'),
      subject: { entity: 'node', types: ['person'] },
      presets: [
        {
          id: testId('preset'),
          label: localized('Preset 1'),
          layoutVariable: 'layout',
          highlight: [{ id: testId('highlight'), variable: 'close', label }],
        },
      ],
    }),
    path: ['presets', 0, 'highlight', 0, 'label'],
  },
  {
    name: 'a Narrative edge legend label',
    schema: narrativeStage,
    holding: (label) => ({
      id: testId('narrative'),
      type: 'Narrative',
      label: localized('Narrative'),
      subject: { entity: 'node', types: ['person'] },
      presets: [
        {
          id: testId('preset'),
          label: localized('Preset 1'),
          layoutVariable: 'layout',
          edges: {
            display: [{ id: testId('edge-display'), type: 'knows', label }],
          },
        },
      ],
    }),
    path: ['presets', 0, 'edges', 'display', 0, 'label'],
  },
  {
    name: 'a Family Pedigree prompt',
    schema: familyPedigreeStage,
    holding: (prompt) => ({
      id: testId('pedigree'),
      type: 'FamilyPedigree',
      label: localized('Family'),
      subject: { entity: 'node', types: ['person'] },
      prompt,
    }),
    path: ['prompt'],
  },
  {
    name: 'a Family Pedigree question about the family',
    schema: familyPedigreeStage,
    holding: (text) => ({
      id: testId('pedigree'),
      type: 'FamilyPedigree',
      label: localized('Family'),
      subject: { entity: 'node', types: ['person'] },
      prompt: localized('Who is in your family?'),
      nominationPrompts: [{ id: testId('q'), text, attribute: 'hasCondition' }],
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
      parseIssues(
        VariableSchema.safeParse(scale({ en: 'Very close', fr: text })),
      ),
    ).toEqual([
      {
        path: 'parameters.maxLabel.fr',
        code: 'custom',
        message: 'Text cannot be blank.',
      },
    ]);
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

describe('option labels', () => {
  const booleanVariable = (label: Record<string, string>) => ({
    name: 'Smokes',
    type: 'boolean',
    component: ComponentTypes.Boolean,
    options: [
      { label, value: true },
      { label: localized('No'), value: false },
    ],
  });
  const categoricalVariable = (label: Record<string, string>) => ({
    name: 'Colour',
    type: 'categorical',
    options: [
      { id: testId('non-blank-text-option-1'), label, value: 'red' },
      {
        id: testId('non-blank-text-option-2'),
        label: localized('Blue'),
        value: 'blue',
      },
    ],
  });
  const ordinalVariable = (label: Record<string, string>) => ({
    name: 'Closeness',
    type: 'ordinal',
    options: [
      { id: testId('non-blank-text-option-3'), label, value: 1 },
      {
        id: testId('non-blank-text-option-4'),
        label: localized('Very close'),
        value: 2,
      },
    ],
  });

  it.each([
    ['a Boolean choice', booleanVariable],
    ['a categorical option', categoricalVariable],
    ['an ordinal option', ordinalVariable],
  ])('%s accepts a label with text', (_n, variable) => {
    expect(VariableSchema.safeParse(variable({ en: 'Red' })).success).toBe(
      true,
    );
  });

  const empty = { path: 'options.0.label.fr', code: 'too_small' };
  const blank = {
    path: 'options.0.label.fr',
    code: 'custom',
    message: 'Text cannot be blank.',
  };

  it.each([
    ['a Boolean choice', '', empty, booleanVariable],
    ['a Boolean choice', '   ', blank, booleanVariable],
    ['a categorical option', '', empty, categoricalVariable],
    ['a categorical option', '   ', blank, categoricalVariable],
    ['an ordinal option', '', empty, ordinalVariable],
    ['an ordinal option', '   ', blank, ordinalVariable],
  ])('%s rejects the label %j', (_n, text, issue, variable) => {
    expect(
      parseIssues(VariableSchema.safeParse(variable({ en: 'Red', fr: text }))),
    ).toEqual([issue]);
  });
});
