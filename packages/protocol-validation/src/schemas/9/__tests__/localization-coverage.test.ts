import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { analyzeProtocolLocalization } from '../../../localization/analyzeProtocolLocalization.ts';
import { resolveLocalizedString } from '../../../localization/resolveLocalizedString.ts';
import {
  collectLocalizedStrings,
  collectLocalizedStringsFromSchema,
} from '../../../utils/collectLocalizedStrings.ts';
import { localized } from '../../../utils/test-utils.ts';
import {
  type LocalizedStringFormat,
  localizedString,
} from '../localized-string.ts';
import ProtocolSchemaV9 from '../schema.ts';

type Path = readonly (string | number)[];

const shape = { default: 'circle' };

const options = (...labels: [string, string | number][]) =>
  labels.map(([label, value]) => ({ label: localized(label), value }));

/**
 * One protocol holding every participant-facing field family the schema
 * declares, each carrying copy. `EXPECTED_SITES` lists exactly those values.
 */
const completeProtocol = () => ({
  name: 'Localization coverage',
  schemaVersion: 9 as const,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {
    img: { id: 'img', type: 'image', name: 'img.png', source: 'img.png' },
    roster: {
      id: 'roster',
      type: 'network',
      name: 'roster.csv',
      source: 'roster.csv',
    },
    token: { id: 'token', type: 'apikey', name: 'token', value: 'pk.test' },
    map: {
      id: 'map',
      type: 'geojson',
      name: 'map.geojson',
      source: 'map.geojson',
    },
  },
  codebook: {
    ego: {
      variables: {
        egoName: {
          name: 'EgoName',
          label: localized('Your name'),
          type: 'text',
          component: 'Text',
        },
      },
    },
    node: {
      person: {
        name: 'Person',
        label: localized('Person'),
        color: 'node-color-seq-1',
        shape,
        variables: {
          name: {
            name: 'Name',
            label: localized('Name'),
            type: 'text',
            component: 'Text',
          },
          nickname: {
            name: 'Nickname',
            label: localized('Nickname'),
            type: 'text',
            component: 'Text',
          },
          layoutPosition: {
            name: 'LayoutPosition',
            label: localized('Position'),
            type: 'layout',
          },
          category: {
            name: 'Category',
            label: localized('Category'),
            type: 'categorical',
            options: options(['Friend', 'friend'], ['Family', 'family']),
          },
          other: {
            name: 'Other',
            label: localized('Other'),
            type: 'text',
          },
          strength: {
            name: 'Strength',
            label: localized('Strength'),
            type: 'ordinal',
            options: options(['Weak', 1], ['Strong', 2]),
          },
          closeness: {
            name: 'Closeness',
            label: localized('Closeness'),
            type: 'scalar',
            component: 'VisualAnalogScale',
            parameters: {
              minLabel: localized('Distant'),
              maxLabel: localized('Close'),
            },
          },
          flag: {
            name: 'Flag',
            label: localized('Flag'),
            type: 'boolean',
            component: 'Boolean',
            options: [
              { label: localized('Yes'), value: true },
              { label: localized('No'), value: false },
            ],
          },
          region: {
            name: 'Region',
            label: localized('Region'),
            type: 'location',
          },
        },
      },
      relative: {
        name: 'Relative',
        label: localized('Relative'),
        color: 'node-color-seq-2',
        shape,
        variables: {
          isEgo: { name: 'IsEgo', label: localized('Is ego'), type: 'boolean' },
          displayName: {
            name: 'DisplayName',
            label: localized('Display name'),
            type: 'text',
          },
          relationship: {
            name: 'Relationship',
            label: localized('Relationship'),
            type: 'text',
          },
          sex: { name: 'Sex', label: localized('Sex'), type: 'text' },
          birthYear: {
            name: 'BirthYear',
            label: localized('Birth year'),
            type: 'number',
            component: 'Number',
          },
          affected: {
            name: 'Affected',
            label: localized('Affected'),
            type: 'boolean',
          },
          nominated: {
            name: 'Nominated',
            label: localized('Nominated'),
            type: 'boolean',
          },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        label: localized('Knows'),
        color: 'edge-color-seq-1',
        variables: {
          tieStrength: {
            name: 'TieStrength',
            label: localized('Tie strength'),
            type: 'ordinal',
            options: options(['Weak tie', 1], ['Strong tie', 2]),
          },
          note: {
            name: 'Note',
            label: localized('Note'),
            type: 'text',
            component: 'Text',
          },
        },
      },
      family: {
        name: 'Family',
        label: localized('Family'),
        color: 'edge-color-seq-2',
        variables: {
          relType: { name: 'RelType', label: localized('Kind'), type: 'text' },
          isActive: {
            name: 'IsActive',
            label: localized('Current'),
            type: 'boolean',
          },
          isGc: {
            name: 'IsGc',
            label: localized('Carrier'),
            type: 'boolean',
          },
          gameteRole: {
            name: 'GameteRole',
            label: localized('Gamete'),
            type: 'text',
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'chooser',
      type: 'LanguageChooser',
      label: localized('Language'),
      introduction: localized('Choose a language'),
    },
    {
      id: 'information',
      type: 'Information',
      label: localized('Welcome'),
      title: localized('Welcome title'),
      items: [
        { id: 'i1', type: 'text', content: localized('Welcome text') },
        {
          id: 'i2',
          type: 'asset',
          content: 'img',
          description: localized('Image caption'),
        },
      ],
    },
    {
      id: 'egoForm',
      type: 'EgoForm',
      label: localized('About you'),
      introductionPanel: {
        title: localized('About you title'),
        text: localized('About you text'),
      },
      form: {
        fields: [
          {
            variable: 'egoName',
            prompt: localized('What is your name?'),
            hint: localized('First name is fine'),
          },
        ],
      },
    },
    {
      id: 'nameGenerator',
      type: 'NameGenerator',
      label: localized('Name people'),
      subject: { entity: 'node', type: 'person' },
      form: {
        title: localized('Add a person'),
        fields: [{ variable: 'name', prompt: localized('Their name') }],
      },
      panels: [
        {
          id: 'panel',
          title: localized('People so far'),
          dataSource: 'existing',
        },
      ],
      prompts: [{ id: 'p1', text: localized('Who do you know?') }],
    },
    {
      id: 'quickAdd',
      type: 'NameGeneratorQuickAdd',
      label: localized('Quick add'),
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      prompts: [{ id: 'p1', text: localized('Who else?') }],
    },
    {
      id: 'roster',
      type: 'NameGeneratorRoster',
      label: localized('Roster'),
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster',
      cardOptions: {
        additionalProperties: [
          { label: localized('Card detail'), variable: 'name' },
        ],
      },
      sortOptions: {
        sortableProperties: [{ label: localized('Sort by'), variable: 'name' }],
      },
      prompts: [{ id: 'p1', text: localized('Pick from the roster') }],
    },
    {
      id: 'sociogram',
      type: 'Sociogram',
      label: localized('Sociogram'),
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 3 },
      prompts: [
        {
          id: 'p1',
          text: localized('Place people'),
          layout: { layoutVariable: 'layoutPosition' },
        },
      ],
    },
    {
      id: 'composer',
      type: 'NetworkComposer',
      label: localized('Composer'),
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layoutPosition',
      background: { concentricCircles: 3 },
      nodeForm: {
        fields: [
          {
            variable: 'closeness',
            component: 'VisualAnalogScale',
            label: localized('How close?'),
            hint: localized('Drag the slider'),
            parameters: {
              minLabel: localized('Not at all'),
              maxLabel: localized('Very'),
            },
          },
          {
            variable: 'nickname',
            component: 'Text',
            label: localized('Nickname?'),
          },
        ],
      },
      edges: [
        {
          id: 'knowsEdge',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                variable: 'note',
                component: 'Text',
                label: localized('Anything to add?'),
              },
            ],
          },
        },
      ],
    },
    {
      id: 'alterForm',
      type: 'AlterForm',
      label: localized('About them'),
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: localized('About them title'),
        text: localized('About them text'),
      },
      form: {
        fields: [{ variable: 'nickname', prompt: localized('Nickname') }],
      },
    },
    {
      id: 'alterEdgeForm',
      type: 'AlterEdgeForm',
      label: localized('About ties'),
      subject: { entity: 'edge', type: 'knows' },
      introductionPanel: {
        title: localized('About ties title'),
        text: localized('About ties text'),
      },
      form: { fields: [{ variable: 'note', prompt: localized('Note') }] },
    },
    {
      id: 'dyadCensus',
      type: 'DyadCensus',
      label: localized('Pairs'),
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: localized('Pairs title'),
        text: localized('Pairs text'),
      },
      prompts: [
        {
          id: 'p1',
          text: localized('Do they know each other?'),
          createEdge: 'knows',
        },
      ],
    },
    {
      id: 'tieStrength',
      type: 'TieStrengthCensus',
      label: localized('Tie strength'),
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: localized('Tie strength title'),
        text: localized('Tie strength text'),
      },
      prompts: [
        {
          id: 'p1',
          text: localized('How well?'),
          createEdge: 'knows',
          edgeVariable: 'tieStrength',
          negativeLabel: localized('Not at all'),
        },
      ],
    },
    {
      id: 'ordinalBin',
      type: 'OrdinalBin',
      label: localized('Ordinal'),
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: localized('How strong?'),
          variable: 'strength',
          color: 'ord-color-seq-1',
        },
      ],
    },
    {
      id: 'categoricalBin',
      type: 'CategoricalBin',
      label: localized('Categorical'),
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: localized('Which category?'),
          variable: 'category',
          otherVariable: 'other',
          otherVariablePrompt: localized('Which other?'),
          otherOptionLabel: localized('Something else'),
        },
      ],
    },
    {
      id: 'narrative',
      type: 'Narrative',
      label: localized('Narrative'),
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 3 },
      presets: [
        {
          id: 'preset',
          label: localized('Preset'),
          layoutVariable: 'layoutPosition',
        },
      ],
    },
    {
      id: 'anonymisation',
      type: 'Anonymisation',
      label: localized('Privacy'),
      explanationText: {
        title: localized('Privacy title'),
        body: localized('Privacy body'),
      },
    },
    {
      id: 'oneToMany',
      type: 'OneToManyDyadCensus',
      label: localized('One to many'),
      subject: { entity: 'node', type: 'person' },
      behaviours: { removeAfterConsideration: false },
      prompts: [
        { id: 'p1', text: localized('Who knows whom?'), createEdge: 'knows' },
      ],
    },
    {
      id: 'geospatial',
      type: 'Geospatial',
      label: localized('Map'),
      subject: { entity: 'node', type: 'person' },
      mapOptions: {
        tokenAssetId: 'token',
        style: 'mapbox://styles/mapbox/standard',
        center: [0, 0],
        initialZoom: 1,
        dataSourceAssetId: 'map',
        color: 'node-color-seq-1',
        targetFeatureProperty: 'name',
      },
      prompts: [
        {
          id: 'p1',
          text: localized('Where do they live?'),
          variable: 'region',
        },
      ],
    },
    {
      id: 'familyPedigree',
      type: 'FamilyPedigree',
      label: localized('Family'),
      nodeConfig: {
        type: 'relative',
        nodeLabelVariable: 'displayName',
        egoVariable: 'isEgo',
        relationshipVariable: 'relationship',
        biologicalSexVariable: 'sex',
        form: [
          {
            variable: 'birthYear',
            prompt: localized('Birth year?'),
            hint: localized('Approximate is fine'),
          },
        ],
      },
      edgeConfig: {
        type: 'family',
        relationshipTypeVariable: 'relType',
        isActiveVariable: 'isActive',
        isGestationalCarrierVariable: 'isGc',
        gameteRoleVariable: 'gameteRole',
      },
      framing: { mode: 'participantChoice' },
      boundaries: {
        requireGrandparents: 'off',
        requireChildrenContributors: 'off',
      },
      introScreen: {
        items: [
          { id: 'f1', type: 'text', content: localized('Family intro') },
          {
            id: 'f2',
            type: 'asset',
            content: 'img',
            description: localized('Family image'),
          },
        ],
      },
      censusPrompt: localized('Build your family'),
      nominationPrompts: [
        {
          id: 'n1',
          text: localized('Who is affected?'),
          variable: 'nominated',
        },
      ],
    },
    {
      id: 'narrativePedigree',
      type: 'NarrativePedigree',
      label: localized('Family health'),
      sourceStageId: 'familyPedigree',
      diseases: [
        {
          id: 'd1',
          label: localized('Condition'),
          color: 'node-color-seq-3',
          variable: 'affected',
          inheritancePattern: 'autosomalDominant',
        },
      ],
    },
  ],
});

type ExpectedSite = Readonly<{
  path: Path;
  format: LocalizedStringFormat;
  // Whether the field's own rule allows an empty translation.
  allowsEmpty: boolean;
}>;

const site = (
  path: Path,
  format: LocalizedStringFormat,
  allowsEmpty = false,
): ExpectedSite => ({ path, format, allowsEmpty });

const person = ['codebook', 'node', 'person'] as const;
const personVariable = (id: string) => [...person, 'variables', id] as const;
const relativeVariable = (id: string) =>
  ['codebook', 'node', 'relative', 'variables', id] as const;
const knowsVariable = (id: string) =>
  ['codebook', 'edge', 'knows', 'variables', id] as const;
const familyVariable = (id: string) =>
  ['codebook', 'edge', 'family', 'variables', id] as const;
const stage = (index: number, ...rest: (string | number)[]) => [
  'stages',
  index,
  ...rest,
];

const EXPECTED_SITES: readonly ExpectedSite[] = [
  // Codebook entity and variable labels, and variable option copy.
  site(['codebook', 'ego', 'variables', 'egoName', 'label'], 'plain'),
  site([...person, 'label'], 'plain', true),
  ...[
    'name',
    'nickname',
    'layoutPosition',
    'category',
    'other',
    'strength',
    'closeness',
    'flag',
    'region',
  ].map((id) => site([...personVariable(id), 'label'], 'plain')),
  site(
    [...personVariable('category'), 'options', 0, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('category'), 'options', 1, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('strength'), 'options', 0, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('strength'), 'options', 1, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('closeness'), 'parameters', 'minLabel'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('closeness'), 'parameters', 'maxLabel'],
    'markdown',
    true,
  ),
  site([...personVariable('flag'), 'options', 0, 'label'], 'markdown', true),
  site([...personVariable('flag'), 'options', 1, 'label'], 'markdown', true),
  site(['codebook', 'node', 'relative', 'label'], 'plain', true),
  ...[
    'isEgo',
    'displayName',
    'relationship',
    'sex',
    'birthYear',
    'affected',
    'nominated',
  ].map((id) => site([...relativeVariable(id), 'label'], 'plain')),
  site(['codebook', 'edge', 'knows', 'label'], 'plain', true),
  site([...knowsVariable('tieStrength'), 'label'], 'plain'),
  site(
    [...knowsVariable('tieStrength'), 'options', 0, 'label'],
    'markdown',
    true,
  ),
  site(
    [...knowsVariable('tieStrength'), 'options', 1, 'label'],
    'markdown',
    true,
  ),
  site([...knowsVariable('note'), 'label'], 'plain'),
  site(['codebook', 'edge', 'family', 'label'], 'plain', true),
  ...['relType', 'isActive', 'isGc', 'gameteRole'].map((id) =>
    site([...familyVariable(id), 'label'], 'plain'),
  ),

  // Every stage's label.
  ...Array.from({ length: 20 }, (_, index) =>
    site(stage(index, 'label'), 'plain'),
  ),

  site(stage(0, 'introduction'), 'markdown'),

  site(stage(1, 'title'), 'plain'),
  site(stage(1, 'items', 0, 'content'), 'markdown'),
  site(stage(1, 'items', 1, 'description'), 'plain', true),

  site(stage(2, 'introductionPanel', 'title'), 'plain'),
  site(stage(2, 'introductionPanel', 'text'), 'markdown'),
  site(stage(2, 'form', 'fields', 0, 'prompt'), 'markdown'),
  site(stage(2, 'form', 'fields', 0, 'hint'), 'markdown', true),

  site(stage(3, 'form', 'title'), 'plain'),
  site(stage(3, 'form', 'fields', 0, 'prompt'), 'markdown'),
  site(stage(3, 'panels', 0, 'title'), 'plain'),
  site(stage(3, 'prompts', 0, 'text'), 'markdown'),

  site(stage(4, 'prompts', 0, 'text'), 'markdown'),

  site(
    stage(5, 'cardOptions', 'additionalProperties', 0, 'label'),
    'plain',
    true,
  ),
  site(
    stage(5, 'sortOptions', 'sortableProperties', 0, 'label'),
    'plain',
    true,
  ),
  site(stage(5, 'prompts', 0, 'text'), 'markdown'),

  site(stage(6, 'prompts', 0, 'text'), 'markdown'),

  // The composer's own scale end labels are separate sites from the codebook
  // scalar's, and override them.
  site(stage(7, 'nodeForm', 'fields', 0, 'label'), 'markdown', true),
  site(stage(7, 'nodeForm', 'fields', 0, 'hint'), 'markdown', true),
  site(
    stage(7, 'nodeForm', 'fields', 0, 'parameters', 'minLabel'),
    'markdown',
    true,
  ),
  site(
    stage(7, 'nodeForm', 'fields', 0, 'parameters', 'maxLabel'),
    'markdown',
    true,
  ),
  site(stage(7, 'nodeForm', 'fields', 1, 'label'), 'markdown', true),
  site(stage(7, 'edges', 0, 'form', 'fields', 0, 'label'), 'markdown', true),

  site(stage(8, 'introductionPanel', 'title'), 'plain'),
  site(stage(8, 'introductionPanel', 'text'), 'markdown'),
  site(stage(8, 'form', 'fields', 0, 'prompt'), 'markdown'),

  site(stage(9, 'introductionPanel', 'title'), 'plain'),
  site(stage(9, 'introductionPanel', 'text'), 'markdown'),
  site(stage(9, 'form', 'fields', 0, 'prompt'), 'markdown'),

  site(stage(10, 'introductionPanel', 'title'), 'plain'),
  site(stage(10, 'introductionPanel', 'text'), 'markdown'),
  site(stage(10, 'prompts', 0, 'text'), 'markdown'),

  site(stage(11, 'introductionPanel', 'title'), 'plain'),
  site(stage(11, 'introductionPanel', 'text'), 'markdown'),
  site(stage(11, 'prompts', 0, 'text'), 'markdown'),
  site(stage(11, 'prompts', 0, 'negativeLabel'), 'markdown'),

  site(stage(12, 'prompts', 0, 'text'), 'markdown'),

  site(stage(13, 'prompts', 0, 'text'), 'markdown'),
  site(stage(13, 'prompts', 0, 'otherVariablePrompt'), 'markdown'),
  site(stage(13, 'prompts', 0, 'otherOptionLabel'), 'markdown'),

  site(stage(14, 'presets', 0, 'label'), 'plain'),

  site(stage(15, 'explanationText', 'title'), 'plain'),
  site(stage(15, 'explanationText', 'body'), 'markdown'),

  site(stage(16, 'prompts', 0, 'text'), 'markdown'),

  site(stage(17, 'prompts', 0, 'text'), 'markdown'),

  site(stage(18, 'nodeConfig', 'form', 0, 'prompt'), 'markdown'),
  site(stage(18, 'nodeConfig', 'form', 0, 'hint'), 'markdown', true),
  site(stage(18, 'introScreen', 'items', 0, 'content'), 'markdown', true),
  site(stage(18, 'introScreen', 'items', 1, 'description'), 'plain', true),
  site(stage(18, 'censusPrompt'), 'markdown'),
  site(stage(18, 'nominationPrompts', 0, 'text'), 'markdown'),

  site(stage(19, 'diseases', 0, 'label'), 'plain'),
];

const pathKey = (path: readonly PropertyKey[]) =>
  JSON.stringify(path.map((key) => (typeof key === 'symbol' ? '' : key)));

const setAt = (root: object, path: Path, value: unknown): void => {
  let node: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(`No value at ${pathKey(path)}`);
    }
    node = Reflect.get(node, key);
  }
  const last = path.at(-1);
  if (typeof node !== 'object' || node === null || last === undefined) {
    throw new Error(`No value at ${pathKey(path)}`);
  }
  Reflect.set(node, last, value);
};

const withValueAt = (path: Path, value: unknown) => {
  const protocol = completeProtocol();
  setAt(protocol, path, value);
  return protocol;
};

// Every path an issue names, including those inside a union's branches, so a
// field reached through a plain union is matched at its own path.
const issuePaths = (
  issues: readonly z.core.$ZodIssue[],
  prefix: readonly PropertyKey[] = [],
): string[] =>
  issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    const nested =
      issue.code === 'invalid_union'
        ? issue.errors.flatMap((branch) => issuePaths(branch, path))
        : [];
    return [pathKey(path), ...nested];
  });

const failurePaths = (protocol: unknown): string[] => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success ? [] : issuePaths(result.error.issues);
};

const siteName = ({ path }: ExpectedSite) => path.join('.');

describe('localized string coverage', () => {
  it('accepts a protocol with copy in every localized field family', () => {
    const result = ProtocolSchemaV9.safeParse(completeProtocol());
    expect(result.error?.issues).toBeUndefined();
  });

  it('finds exactly the expected localized sites', () => {
    const found = collectLocalizedStrings(completeProtocol())
      .map(({ path, format }) => ({ path: pathKey(path), format }))
      .toSorted((a, b) => a.path.localeCompare(b.path));
    const expected = EXPECTED_SITES.map(({ path, format }) => ({
      path: pathKey(path),
      format,
    })).toSorted((a, b) => a.path.localeCompare(b.path));
    expect(found).toEqual(expected);
  });

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects plain-string copy at %s',
    (_name, { path }) => {
      expect(failurePaths(withValueAt(path, 'Plain text'))).toContain(
        pathKey(path),
      );
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects copy with no translation at %s',
    (_name, { path }) => {
      expect(failurePaths(withValueAt(path, {}))).toContain(pathKey(path));
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects a translation in a language the protocol does not declare at %s',
    (_name, { path }) => {
      const protocol = withValueAt(path, { en: 'English', fr: 'Français' });
      expect(failurePaths(protocol)).toEqual([pathKey([...path, 'fr'])]);
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'keeps the field rule for an empty translation at %s',
    (_name, { path, allowsEmpty }) => {
      const paths = failurePaths(withValueAt(path, { en: '' }));
      if (allowsEmpty) expect(paths).toEqual([]);
      else expect(paths).toContain(pathKey([...path, 'en']));
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects message placeholders at %s',
    (_name, { path }) => {
      expect(failurePaths(withValueAt(path, { en: 'Hello {name}' }))).toContain(
        pathKey([...path, 'en']),
      );
    },
  );
});

describe('Network Composer scale end labels', () => {
  const field = {
    component: 'VisualAnalogScale',
    parameters: { minLabel: localized('Low'), step: 5 },
  };

  it('keeps parameter keys that carry no copy', () => {
    const protocol = completeProtocol();
    setAt(protocol, stage(7, 'nodeForm', 'fields', 0, 'parameters', 'step'), 5);
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
  });

  // The typed branch is what makes the end labels visible: behind an opaque
  // parameter record the same value carries no metadata to find.
  it('would hide the end labels behind an opaque parameter record', () => {
    const typed = z.object({
      component: z.string(),
      parameters: z.looseObject({
        minLabel: localizedString(z.string(), 'markdown').optional(),
      }),
    });
    const opaque = z.object({
      component: z.string(),
      parameters: z.record(z.string(), z.unknown()),
    });
    expect(
      collectLocalizedStringsFromSchema(typed, field).map(({ path }) => path),
    ).toEqual([['parameters', 'minLabel']]);
    expect(collectLocalizedStringsFromSchema(opaque, field)).toEqual([]);
  });

  it('does not treat end labels on another control as copy', () => {
    const protocol = completeProtocol();
    setAt(protocol, stage(7, 'nodeForm', 'fields', 1, 'parameters'), {
      minLabel: 'not copy',
    });
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(
      collectLocalizedStrings(protocol).some(
        ({ path }) =>
          pathKey(path) ===
          pathKey(stage(7, 'nodeForm', 'fields', 1, 'parameters', 'minLabel')),
      ),
    ).toBe(false);
  });
});

describe('analyzeProtocolLocalization', () => {
  const bilingual = () => {
    const protocol = completeProtocol();
    protocol.localization = { defaultLocale: 'en', locales: ['en', 'fr'] };
    return protocol;
  };

  const warningsAt = (
    protocol: ReturnType<typeof completeProtocol>,
    path: Path,
  ) =>
    analyzeProtocolLocalization(ProtocolSchemaV9.parse(protocol)).filter(
      (warning) => pathKey(warning.path) === pathKey(path),
    );

  it('accepts and warns about a missing translation in a declared language', () => {
    const protocol = bilingual();
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(warningsAt(protocol, stage(0, 'label'))).toEqual([
      {
        code: 'missing-translation',
        path: stage(0, 'label'),
        locale: 'fr',
        isDefaultLocale: false,
        fallbackLocale: 'en',
      },
    ]);
  });

  it('warns about a missing default-language translation', () => {
    const protocol = bilingual();
    setAt(protocol, stage(0, 'label'), { fr: 'Langue' });
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(warningsAt(protocol, stage(0, 'label'))).toEqual([
      {
        code: 'missing-translation',
        path: stage(0, 'label'),
        locale: 'en',
        isDefaultLocale: true,
        fallbackLocale: 'fr',
      },
    ]);
  });

  // A regional language falls back to its related translation rather than to
  // the default, exactly as the interview resolves it.
  it('reports the fallback the interview resolves for each missing language', () => {
    const protocol = completeProtocol();
    protocol.localization = {
      defaultLocale: 'en',
      locales: ['en', 'es', 'es-MX'],
    };
    const label = { en: 'Language', es: 'Idioma' };
    setAt(protocol, stage(0, 'label'), label);
    const warnings = warningsAt(protocol, stage(0, 'label'));
    expect(warnings).toEqual([
      expect.objectContaining({ locale: 'es-MX', fallbackLocale: 'es' }),
    ]);
    expect(warnings[0]?.fallbackLocale).toBe(
      resolveLocalizedString(label, protocol.localization, 'es-MX').locale,
    );
  });

  it('reports nothing for a fully translated string', () => {
    const protocol = bilingual();
    setAt(protocol, stage(0, 'label'), { en: 'Language', fr: 'Langue' });
    expect(warningsAt(protocol, stage(0, 'label'))).toEqual([]);
  });
});

describe('LanguageChooser stage', () => {
  it('accepts a chooser without an introduction', () => {
    expect(
      failurePaths(withValueAt(stage(0, 'introduction'), undefined)),
    ).toEqual([]);
  });

  it('rejects keys the chooser does not define', () => {
    expect(failurePaths(withValueAt(stage(0, 'locales'), ['en']))).toContain(
      pathKey(stage(0)),
    );
  });
});
