import { localized, localizedOptions } from '../../../utils/test-utils.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import { DEFAULT_FINISH_SESSION_TEXT } from '../finish-session-defaults.ts';
import {
  pedigreeCompletenessText,
  pedigreeNameField,
} from './family-pedigree-text.ts';

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
          label: 'Your name',
          type: 'text',
          component: 'Text',
          validation: { required: true, minLength: 2, maxLength: 40 },
        },
        // Every validation rule and date bound, so the protocol holds every
        // validation message.
        egoNameAgain: {
          name: 'EgoNameAgain',
          label: 'Your name again',
          type: 'text',
          component: 'Text',
          validation: { sameAs: 'egoName' },
        },
        egoNickname: {
          name: 'EgoNickname',
          label: 'Your nickname',
          type: 'text',
          component: 'Text',
          validation: { differentFrom: 'egoName' },
        },
        egoAge: {
          name: 'EgoAge',
          label: 'Your age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 0, maxValue: 120 },
        },
        egoFirstAge: {
          name: 'EgoFirstAge',
          label: 'Age at first',
          type: 'number',
          component: 'Number',
          validation: { lessThanVariable: 'egoAge' },
        },
        egoLastAge: {
          name: 'EgoLastAge',
          label: 'Age at last',
          type: 'number',
          component: 'Number',
          validation: {
            greaterThanVariable: 'egoFirstAge',
            lessThanOrEqualToVariable: 'egoAge',
          },
        },
        egoMovedAge: {
          name: 'EgoMovedAge',
          label: 'Age when moved',
          type: 'number',
          component: 'Number',
          validation: { greaterThanOrEqualToVariable: 'egoFirstAge' },
        },
        egoBorn: {
          name: 'EgoBorn',
          label: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '1900-01-01', max: '2020-12-31' },
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
            label: 'Name',
            type: 'text',
            component: 'Text',
            validation: { unique: true },
          },
          nickname: {
            name: 'Nickname',
            label: 'Nickname',
            type: 'text',
            component: 'Text',
          },
          layoutPosition: {
            name: 'LayoutPosition',
            label: 'Position',
            type: 'layout',
          },
          category: {
            name: 'Category',
            label: 'Category',
            type: 'categorical',
            options: options(['Friend', 'friend'], ['Family', 'family']),
            validation: { minSelected: 1, maxSelected: 2 },
          },
          other: {
            name: 'Other',
            label: 'Other',
            type: 'text',
          },
          strength: {
            name: 'Strength',
            label: 'Strength',
            type: 'ordinal',
            options: options(['Weak', 1], ['Strong', 2]),
          },
          closeness: {
            name: 'Closeness',
            label: 'Closeness',
            type: 'scalar',
            component: 'VisualAnalogScale',
            parameters: {
              minLabel: localized('Distant'),
              maxLabel: localized('Close'),
            },
          },
          flag: {
            name: 'Flag',
            label: 'Flag',
            type: 'boolean',
            component: 'Boolean',
            options: [
              { label: localized('Yes'), value: true },
              { label: localized('No'), value: false },
            ],
          },
          region: {
            name: 'Region',
            label: 'Region',
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
          isEgo: { name: 'IsEgo', label: 'Is ego', type: 'boolean' },
          displayName: {
            name: 'DisplayName',
            label: 'Display name',
            type: 'text',
          },
          sex: {
            name: 'Sex',
            label: 'Sex',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
          },
          relativesNotRecorded: {
            name: 'RelativesNotRecorded',
            label: 'Relatives not recorded',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS),
          },
          birthYear: {
            name: 'BirthYear',
            label: 'Birth year',
            type: 'number',
            component: 'Number',
          },
          affected: {
            name: 'Affected',
            label: 'Affected',
            type: 'boolean',
          },
          nominated: {
            name: 'Nominated',
            label: 'Nominated',
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
            label: 'Tie strength',
            type: 'ordinal',
            options: options(['Weak tie', 1], ['Strong tie', 2]),
          },
          note: {
            name: 'Note',
            label: 'Note',
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
          relType: {
            name: 'RelType',
            label: 'Kind',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
          },
          isActive: {
            name: 'IsActive',
            label: 'Current',
            type: 'boolean',
          },
          isGc: {
            name: 'IsGc',
            label: 'Carrier',
            type: 'boolean',
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
      behaviours: { minNodes: 1, maxNodes: 5 },
      minNodesNotice: localized(
        '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
      ),
      maxNodesNotice: localized(
        'You have completed this task. Click the next arrow to continue.',
      ),
      externalDataError: localized('External data could not be loaded.'),
      panels: [
        {
          id: 'panel',
          title: localized('People so far'),
          dataSource: 'existing',
        },
        {
          id: 'external',
          title: localized('From the roster'),
          dataSource: 'roster',
        },
      ],
      prompts: [{ id: 'p1', text: localized('Who do you know?') }],
    },
    {
      id: 'quickAdd',
      type: 'NameGeneratorQuickAdd',
      quickAddHint: localized('Press Enter when you are finished.'),
      label: localized('Quick add'),
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      prompts: [{ id: 'p1', text: localized('Who else?') }],
    },
    {
      id: 'roster',
      type: 'NameGeneratorRoster',
      externalDataError: localized('External data could not be loaded.'),
      allAddedNotice: localized('There is nothing left to add from this list.'),
      label: localized('Roster'),
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster',
      panelTitle: localized('Available to add'),
      behaviours: { minNodes: 1, maxNodes: 5 },
      minNodesNotice: localized(
        '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
      ),
      maxNodesNotice: localized(
        'You have completed this task. Click the next arrow to continue.',
      ),
      searchLabel: localized('Search'),
      searchNoMatch: localized('Nothing matched your search term.'),
      searchOptions: { fuzziness: 0.5, matchProperties: ['name'] },
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
          highlight: [{ variable: 'flag', label: localized('Flagged') }],
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
      offlineNotice: localized(
        'You are offline — the map will not load until you reconnect.',
      ),
      mapUnavailable: localized(
        'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
      ),
      outsideAreasLabel: localized('Outside Selectable Areas'),
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
        allowSearch: true,
      },
      searchLabel: localized('Search'),
      searchNoMatch: localized('Nothing matched your search term.'),
      searchFailed: localized(
        'Search could not be completed. Try again in a moment.',
      ),
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
      subject: { entity: 'node', type: 'relative' },
      prompt: localized('Build your family'),
      nodeConfiguration: {
        nameAttribute: 'displayName',
        nameField: pedigreeNameField(),
        sexAssignedAtBirthAttribute: 'sex',
        egoAttribute: 'isEgo',
      },
      edgeConfiguration: {
        type: 'family',
        kindAttribute: 'relType',
        gestationalCarrierAttribute: 'isGc',
        currentPartnerAttribute: 'isActive',
      },
      completeness: {
        scope: 'parents',
        enforcement: 'recommended',
        relativesNotRecordedAttribute: 'relativesNotRecorded',
        ...pedigreeCompletenessText(),
      },
      form: {
        fields: [
          {
            variable: 'birthYear',
            prompt: localized('Birth year?'),
            hint: localized('Approximate is fine'),
          },
        ],
      },
      nominationPrompts: [
        {
          id: 'n1',
          text: localized('Who is affected?'),
          attribute: 'nominated',
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
          attribute: 'affected',
          inheritancePattern: 'autosomalDominant',
        },
      ],
    },
    // Schema 8 has no finish stage; the migration adds this one, with this
    // id and the supplied text.
    {
      id: 'finish',
      type: 'FinishSession',
      label: localized(DEFAULT_FINISH_SESSION_TEXT.en.label),
      title: localized(DEFAULT_FINISH_SESSION_TEXT.en.title),
      content: localized(DEFAULT_FINISH_SESSION_TEXT.en.content),
      // The English Network Canvas supplies, as the migration writes it.
      finishLabel: localized('Finish'),
      finishConfirmation: localized(
        'Are you sure you want to finish the interview?',
      ),
      finishedNotice: localized(
        'This interview is finished, and its answers can no longer be changed.',
      ),
      finishFailed: localized(
        'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
      ),
      outcome: 'completed',
    },
  ],
});
