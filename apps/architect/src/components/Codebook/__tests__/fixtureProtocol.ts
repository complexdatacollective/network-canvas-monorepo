import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';

/**
 * One protocol DOCUMENT covering every shape the codebook's synthetic columns
 * have to describe, and the parse of that same document.
 *
 * Deliberately a document rather than a hand-built parsed object: what the
 * codebook shows is the schema's resolution of what the file states, and the
 * document is also what the editing surfaces really hold — the redux buffer is
 * the stored protocol, pre-parse. A fixture that skipped the parse would test
 * the fixture instead of the screen; `parseFixture` throws loudly if the
 * document ever stops being valid.
 *
 * What it exercises:
 *  - variables of every synthetic-bearing type, one authored, one written only
 *    by a categorical bin, and one written by a quick-add field;
 *  - a layout variable, which generation places deterministically and which
 *    therefore has nothing to author;
 *  - stages of several kinds around them — a categorical bin, a quick-add name
 *    generator, forms, sociograms and a census — so the interface-implied rules
 *    the columns report have real sources to name.
 */

export const FIXTURE_DOCUMENT = {
  name: 'Synthetic codebook fixture',
  description:
    'A protocol shaped to exercise the codebook’s synthetic columns.',
  schemaVersion: 8,
  codebook: {
    ego: {
      variables: {
        egoAge: {
          name: 'egoAge',
          type: 'number',
          component: 'Number',
          // Authored: the only variable in the fixture whose `synthetic` key
          // the document states.
          synthetic: { distribution: 'constant', value: 40 },
        },
      },
    },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          personName: { name: 'name', type: 'text', component: 'Text' },
          personAge: {
            name: 'age',
            type: 'number',
            component: 'Number',
            validation: { minValue: 18, maxValue: 90 },
          },
          personClose: { name: 'close', type: 'boolean', component: 'Toggle' },
          personContact: {
            name: 'contactType',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: 'Family', value: 'family' },
              { label: 'Work', value: 'work' },
            ],
          },
          personRecent: {
            name: 'lastSpoke',
            type: 'datetime',
            component: 'DatePicker',
          },
          personTrust: {
            name: 'trust',
            type: 'scalar',
            component: 'VisualAnalogScale',
            synthetic: {
              distribution: 'normal',
              mean: 0.5,
              sd: 0.2,
              missingProbability: 0.1,
            },
          },
          personLayout: { name: 'layout', type: 'layout' },
        },
      },
    },
    edge: {
      friend: {
        name: 'Friend',
        // The codebook screen renders a type only once it carries both a name
        // and a colour (`getEntityProperties`), so an edge without one shows no
        // attribute rows at all.
        color: 'edge-color-seq-1',
        variables: {
          friendStrength: {
            name: 'strength',
            type: 'ordinal',
            component: 'LikertScale',
            options: [
              { label: 'Weak', value: 1 },
              { label: 'Strong', value: 2 },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [{ id: 'welcome-item', type: 'text', content: 'Hello.' }],
    },
    {
      id: 'about-you',
      type: 'EgoForm',
      label: 'About you',
      introductionPanel: { title: 'About you', text: 'A few questions.' },
      form: { fields: [{ variable: 'egoAge', prompt: 'How old are you?' }] },
    },
    {
      id: 'quick-add',
      type: 'NameGeneratorQuickAdd',
      label: 'Quick add friends',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'personName',
      prompts: [{ id: 'quick-add-p1', text: 'Who do you know?' }],
      panels: [
        {
          id: 'panel-existing',
          title: 'People you named',
          dataSource: 'existing',
        },
      ],
    },
    {
      id: 'close-friends',
      type: 'NameGenerator',
      label: 'Close friends',
      subject: { entity: 'node', type: 'person' },
      behaviours: { minNodes: 1, maxNodes: 10 },
      synthetic: {
        count: { distribution: 'poisson', mean: 4 },
        responseBurden: 0.9,
      },
      form: {
        title: 'About them',
        fields: [{ variable: 'personAge', prompt: 'How old are they?' }],
      },
      prompts: [{ id: 'close-friends-p1', text: 'Who are you closest to?' }],
    },
    {
      id: 'map-connections',
      type: 'Sociogram',
      label: 'Map connections',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4 },
      prompts: [
        {
          id: 'map-p1',
          text: 'Connect the people who know each other.',
          layout: { layoutVariable: 'personLayout' },
          edges: { create: 'friend' },
        },
      ],
    },
    {
      id: 'position-only',
      type: 'Sociogram',
      label: 'Position only',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 2 },
      prompts: [
        {
          id: 'position-p1',
          text: 'Place the people closest to you nearest the centre.',
          layout: { layoutVariable: 'personLayout' },
          edges: { display: ['friend'] },
        },
      ],
    },
    {
      id: 'pairs',
      type: 'DyadCensus',
      label: 'Pairs',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Pairs', text: 'About each pair.' },
      synthetic: {
        topology: {
          metric: 'density',
          // `min` and `max` restate the density domain, so the summary elides
          // them; only the parameters that shape the draw should survive.
          distribution: {
            distribution: 'normal',
            mean: 0.3,
            sd: 0.1,
            min: 0,
            max: 1,
          },
        },
      },
      prompts: [
        {
          id: 'pairs-p1',
          text: 'Do these two know each other?',
          createEdge: 'friend',
        },
      ],
    },
    {
      id: 'contact-types',
      type: 'CategoricalBin',
      label: 'Contact types',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'contact-types-p1',
          text: 'Sort these people by how you know them.',
          variable: 'personContact',
        },
      ],
    },
  ],
};

const PERSON_TYPE = {
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    personName: { name: 'name', type: 'text', component: 'Text' },
    personLayout: { name: 'layout', type: 'layout' },
  },
};

/**
 * A protocol the feasibility gate really refuses, with a refusal that names its
 * owning stage.
 *
 * Two name generators guarantee a hundred people each, so the sociogram after
 * them is asked about every pair of two hundred — far past the pair ceiling one
 * stage may enumerate. The engine writes that refusal itself and names the
 * stage inside the reason, which is what the codebook's verdict must reproduce
 * verbatim rather than paraphrase.
 */
export const PAIR_CEILING_DOCUMENT = {
  name: 'Pair ceiling fixture',
  description: 'A protocol that asks one stage for more pairs than it may.',
  schemaVersion: 8,
  codebook: {
    node: { person: PERSON_TYPE },
    edge: { friend: { name: 'Friend', color: 'edge-color-seq-1' } },
  },
  stages: [
    {
      id: 'first-hundred',
      type: 'NameGenerator',
      label: 'First hundred',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 100 } },
      form: {
        title: 'About them',
        fields: [{ variable: 'personName', prompt: 'Their name' }],
      },
      prompts: [{ id: 'first-p1', text: 'Who do you know?' }],
    },
    {
      id: 'second-hundred',
      type: 'NameGenerator',
      label: 'Second hundred',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: 100 } },
      form: {
        title: 'About them',
        fields: [{ variable: 'personName', prompt: 'Their name' }],
      },
      prompts: [{ id: 'second-p1', text: 'Who else do you know?' }],
    },
    {
      id: 'every-pair',
      type: 'Sociogram',
      label: 'Every pair',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 1 },
      prompts: [
        {
          id: 'every-pair-p1',
          text: 'Connect the people who know each other.',
          layout: { layoutVariable: 'personLayout' },
          edges: { create: 'friend' },
        },
      ],
    },
  ],
};

/**
 * The fixture as the schema resolves it. Throws rather than returning a result,
 * so a fixture that stops parsing fails the suite that depends on it instead of
 * quietly producing empty tables.
 */
export const parseFixture = (
  document: unknown = FIXTURE_DOCUMENT,
): CurrentProtocol => CurrentProtocolSchema.parse(document);
