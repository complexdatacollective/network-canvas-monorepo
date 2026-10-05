import { localized } from '../../../utils/test-utils.ts';

const shape = { default: 'circle' };

const options = (...labels: [string, string | number][]) =>
  labels.map(([label, value]) => ({ label: localized(label), value }));

/**
 * One protocol holding every participant-facing field family the schema
 * declares, each carrying copy. `localization-coverage.test.ts` lists exactly
 * those values.
 */
export const completeProtocol = () => ({
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
