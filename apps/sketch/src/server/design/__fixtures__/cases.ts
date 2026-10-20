import type {
  DesignNodeFilter,
  DesignSkipLogic,
  StudyDesign,
} from '../schema.ts';

const always: DesignSkipLogic = {
  mode: 'always_show',
  whenSkipped: 'next_stage',
  match: 'all',
  conditions: [],
};
const noFilter: DesignNodeFilter = { match: 'all', conditions: [] };
type Attr = StudyDesign['egoAttributes'][number];
const A = (
  id: string,
  kind: Attr['kind'],
  question: string,
  rest: Partial<Attr> = {},
): Attr => ({
  id,
  label: id.replace(/_/g, ' '),
  kind,
  question,
  options: [],
  optionScores: [],
  numberRange: [],
  required: false,
  ...rest,
});
const common = (id: string) => ({
  id,
  purpose: `Purpose of ${id}.`,
  interviewerNote: '',
  skipLogic: always,
});

// Exercises every design kind and method, every compiled stage type Sketch emits (15),
// consent-first placement, edge-type skip rules, end_interview, OR filters, rosters and maps.
export const coverageDesign: StudyDesign = {
  workingTitle: 'Coverage design',
  summary: 'Students, classmates and the places they study.',
  rationale: 'Exercises every branch of the compiler.',
  includeConsent: true,
  consentText: '',
  egoAttributes: [
    A('year', 'number', 'Which year of study are you in?', {
      numberRange: [1, 7],
    }),
    A('commutes', 'yes_no', 'Do you commute to campus?'),
    A('satisfaction', 'slider', 'How satisfied are you with university life?', {
      options: ['Not at all', 'Completely'],
    }),
    A('notes', 'long_text', 'Anything else you would like to tell us?'),
    A('birth_date', 'date', 'What is your date of birth?'),
    A('year_started', 'year', 'In which year did you start university?'),
  ],
  nodeTypes: [
    {
      id: 'classmate',
      singular: 'Classmate',
      plural: 'Classmates',
      represents: 'people',
      nameQuestion: "Classmate's name",
      attributes: [
        A('year_of_study', 'number', 'Year of study', { numberRange: [1, 7] }),
        A('major', 'text', 'Major'),
        A('commuter', 'yes_no', 'Commutes?'),
        A('studies_together', 'yes_no', ''),
        A('advisor_type', 'single_choice', 'Who advises them?', {
          options: [
            'Faculty',
            'Peer mentor',
            'Nobody',
            'Another adviser',
            'Not sure',
            'Prefer not to say',
          ],
        }),
      ],
    },
    {
      id: 'place',
      singular: 'Place',
      plural: 'Places',
      represents: 'places',
      nameQuestion: 'What is this place called?',
      attributes: [
        A('visit_freq', 'ordered', 'How often do you go there?', {
          options: ['Rarely', 'Monthly', 'Weekly', 'Daily'],
        }),
        A('place_type', 'multi_choice', 'What do you do there?', {
          options: ['Study', 'Eat', 'Socialise', 'Exercise'],
        }),
      ],
    },
  ],
  relationships: [
    {
      id: 'friends',
      name: 'Friends',
      attributes: [
        A('strength', 'ordered', '', {
          options: ['Acquaintances', 'Friends', 'Close friends'],
        }),
        A('since', 'month_year', 'Since when have they been friends?'),
      ],
    },
    { id: 'studies_with', name: 'Study together', attributes: [] },
    { id: 'conflict', name: 'In conflict', attributes: [] },
  ],
  stages: [
    { kind: 'egoForm', ...common('about'), attributeIds: ['year', 'commutes'] },
    {
      kind: 'nameGenerator',
      ...common('classmates'),
      nodeTypeId: 'classmate',
      method: 'roster',
      attributeIds: ['year_of_study', 'major', 'commuter'],
      prompts: [
        {
          text: 'Select the classmates you **study with**.',
          tagAttributeId: 'studies_together',
        },
      ],
      minNodes: 1,
      maxNodes: 0,
    },
    {
      kind: 'nameGenerator',
      ...common('places'),
      nodeTypeId: 'place',
      method: 'form',
      attributeIds: ['visit_freq'],
      prompts: [
        { text: 'Where do you **spend time on campus**?', tagAttributeId: '' },
      ],
      minNodes: 0,
      maxNodes: 10,
    },
    {
      kind: 'nameGenerator',
      ...common('more_classmates'),
      nodeTypeId: 'classmate',
      method: 'quick_add',
      attributeIds: [],
      prompts: [
        {
          text: 'Who else in your class do you **talk to**?',
          tagAttributeId: '',
        },
      ],
      minNodes: 0,
      maxNodes: 0,
    },
    {
      kind: 'relationshipCensus',
      ...common('friend_strength'),
      nodeTypeId: 'classmate',
      filter: noFilter,
      method: 'with_strength',
      prompts: [
        {
          text: 'How close are these two?',
          relationshipId: 'friends',
          strengthAttributeId: 'strength',
          noTieLabel: "They aren't friends",
        },
      ],
    },
    {
      kind: 'relationshipCensus',
      ...common('study_ties'),
      nodeTypeId: 'classmate',
      filter: noFilter,
      method: 'one_at_a_time',
      prompts: [
        {
          text: 'Tap everyone who **studies with** this person.',
          relationshipId: 'studies_with',
          strengthAttributeId: '',
          noTieLabel: '',
        },
      ],
    },
    {
      kind: 'relationshipCensus',
      ...common('conflicts'),
      nodeTypeId: 'classmate',
      method: 'every_pair',
      skipLogic: {
        mode: 'skip_if',
        whenSkipped: 'next_stage',
        match: 'any',
        conditions: [
          {
            about: 'relationships',
            typeId: 'studies_with',
            attributeId: '',
            operator: 'none_exist',
            value: '',
          },
        ],
      },
      filter: {
        match: 'all',
        conditions: [
          { attributeId: 'studies_together', operator: 'is', value: 'yes' },
        ],
      },
      prompts: [
        {
          text: 'Do these two **have conflict**?',
          relationshipId: 'conflict',
          strengthAttributeId: '',
          noTieLabel: '',
        },
      ],
    },
    {
      kind: 'relationshipForm',
      ...common('friendship_details'),
      relationshipId: 'friends',
      attributeIds: ['since'],
    },
    {
      kind: 'bins',
      ...common('place_bins'),
      nodeTypeId: 'place',
      filter: noFilter,
      prompts: [
        { text: 'How often?', attributeId: 'visit_freq', allowOther: false },
        {
          text: 'What do you do there?',
          attributeId: 'place_type',
          allowOther: true,
        },
      ],
    },
    {
      kind: 'bins',
      ...common('advisors'),
      nodeTypeId: 'classmate',
      filter: noFilter,
      prompts: [
        {
          text: 'Who advises each classmate?',
          attributeId: 'advisor_type',
          allowOther: false,
        },
      ],
    },
    {
      kind: 'geospatial',
      ...common('home_countries'),
      nodeTypeId: 'classmate',
      filter: noFilter,
      mapRegion: 'europe',
      prompts: [
        {
          text: 'Which **country** is each classmate from?',
          locationAttributeId: 'home_country',
        },
      ],
    },
    {
      kind: 'alterForm',
      ...common('classmate_form'),
      nodeTypeId: 'classmate',
      filter: {
        match: 'any',
        conditions: [
          { attributeId: 'year_of_study', operator: 'at_least', value: '2' },
          { attributeId: 'major', operator: 'contains', value: 'bio (x)' },
          {
            attributeId: 'advisor_type',
            operator: 'excludes',
            value: 'nobody',
          },
        ],
      },
      attributeIds: ['commuter', 'year_of_study'],
    },
    {
      kind: 'sociogram',
      ...common('place_map'),
      nodeTypeId: 'place',
      filter: noFilter,
      prompts: [
        {
          task: 'highlight',
          text: 'Tap your **favourite** places.',
          relationshipId: '',
          attributeId: 'favourite',
        },
      ],
    },
    {
      kind: 'narrative',
      ...common('place_story'),
      nodeTypeId: 'place',
      filter: noFilter,
      views: [
        {
          label: 'What you do',
          groupByAttributeId: 'place_type',
          relationshipIds: [],
          highlightAttributeIds: ['favourite'],
        },
      ],
    },
    {
      kind: 'sociogram',
      ...common('class_map'),
      nodeTypeId: 'classmate',
      filter: {
        match: 'all',
        conditions: [{ attributeId: 'name', operator: 'answered', value: '' }],
      },
      prompts: [
        {
          task: 'position',
          text: 'Arrange your classmates.',
          relationshipId: '',
          attributeId: '',
        },
        {
          task: 'connect',
          text: 'Who is friends with whom?',
          relationshipId: 'friends',
          attributeId: '',
        },
      ],
    },
    {
      kind: 'egoForm',
      ...common('reflection'),
      skipLogic: {
        mode: 'show_only_if',
        whenSkipped: 'end_interview',
        match: 'any',
        conditions: [
          {
            about: 'participant',
            typeId: '',
            attributeId: 'commutes',
            operator: 'is',
            value: 'yes',
          },
          {
            about: 'participant',
            typeId: '',
            attributeId: 'year',
            operator: 'greater_than',
            value: '1',
          },
          {
            about: 'nodes',
            typeId: 'place',
            attributeId: 'visit_freq',
            operator: 'at_least',
            value: 'Weekly',
          },
        ],
      },
      attributeIds: ['satisfaction', 'notes', 'birth_date', 'year_started'],
    },
    {
      kind: 'information',
      ...common('bye'),
      role: 'closing',
      content: 'Thanks!',
    },
  ],
};

// A deliberately broken, LLM-style design: every check fires, the repaired protocol must still validate.
export const messyDesign: StudyDesign = {
  workingTitle: '   ',
  summary: 'A messy study of support.',
  rationale: '',
  includeConsent: false,
  consentText: '',
  egoAttributes: [
    A('participant_consent', 'yes_no', 'Do you consent?', { required: true }),
    A('age', 'number', 'Age?', { numberRange: [99, 18] }),
    A('age', 'text', 'Age again?'),
    A('smokes', 'single_choice', 'Do you smoke?', { options: ['Yes', 'No'] }),
    A('mood', 'ordered', 'Mood?', { options: ['Low'] }),
    A('scale', 'ordered', 'Scale?', {
      options: ['a', 'b', 'c'],
      optionScores: [1, 1, 2],
    }),
  ],
  nodeTypes: [
    {
      id: 'Person',
      singular: 'Person',
      plural: '',
      represents: 'people',
      nameQuestion: '',
      attributes: [
        A('person_first_name', 'text', 'Name?'),
        A('person_closeness', 'ordered', 'Close?', {
          options: ['Not', 'Very'],
        }),
        A('close', 'yes_no', ''),
      ],
    },
  ],
  relationships: [{ id: 'person', name: 'Person', attributes: [] }],
  stages: [
    {
      kind: 'information',
      ...common('welcome'),
      role: 'welcome',
      content: 'Hi',
    },
    {
      kind: 'egoForm',
      ...common('consent_form'),
      attributeIds: ['participant_consent'],
    },
    {
      kind: 'alterForm',
      ...common('early'),
      nodeTypeId: 'person',
      filter: noFilter,
      attributeIds: ['closeness'],
    },
    {
      kind: 'egoForm',
      ...common('about'),
      skipLogic: {
        mode: 'skip_if',
        whenSkipped: 'next_stage',
        match: 'all',
        conditions: [
          {
            about: 'participant',
            typeId: '',
            attributeId: 'smokes',
            operator: 'is',
            value: 'yes',
          },
        ],
      },
      attributeIds: ['age', 'smokes', 'undefined_attr', 'closeness'],
    },
    {
      kind: 'nameGenerator',
      ...common('names'),
      nodeTypeId: 'person',
      method: 'quick_add',
      attributeIds: ['first_name'],
      prompts: [
        { text: 'Who?', tagAttributeId: 'close' },
        { text: '', tagAttributeId: '' },
      ],
      minNodes: 5,
      maxNodes: 2,
    },
    {
      kind: 'bins',
      ...common('bins'),
      nodeTypeId: 'person',
      filter: {
        match: 'all',
        conditions: [{ attributeId: 'close', operator: 'is', value: 'maybe' }],
      },
      prompts: [
        { text: 'Sort', attributeId: 'close', allowOther: true },
        {
          text: 'Closeness',
          attributeId: 'person_closeness',
          allowOther: true,
        },
      ],
    },
    {
      kind: 'narrative',
      ...common('story'),
      nodeTypeId: 'person',
      filter: noFilter,
      views: [],
    },
    {
      kind: 'sociogram',
      ...common('map'),
      nodeTypeId: '',
      filter: noFilter,
      prompts: [
        {
          task: 'connect',
          text: 'Connect',
          relationshipId: 'knows',
          attributeId: '',
        },
        {
          task: 'highlight',
          text: 'Mark',
          relationshipId: '',
          attributeId: 'closeness',
        },
        {
          task: 'highlight',
          text: 'Mark helpers',
          relationshipId: '',
          attributeId: 'helper',
        },
      ],
    },
    {
      kind: 'relationshipForm',
      ...common('edge_form'),
      relationshipId: 'person',
      attributeIds: ['x'],
    },
    {
      kind: 'egoForm',
      ...common('mood_form'),
      skipLogic: {
        mode: 'show_only_if',
        whenSkipped: 'next_stage',
        match: 'all',
        conditions: [],
      },
      attributeIds: ['mood', 'scale'],
    },
  ],
};
