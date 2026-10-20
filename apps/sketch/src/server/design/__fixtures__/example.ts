import type {
  DesignNodeFilter,
  DesignSkipLogic,
  StudyDesign,
  Wording,
} from '../schema.ts';

const always: DesignSkipLogic = {
  mode: 'always_show',
  whenSkipped: 'next_stage',
  match: 'all',
  conditions: [],
};
const noFilter: DesignNodeFilter = { match: 'all', conditions: [] };
const A = (
  id: string,
  label: string,
  kind: StudyDesign['egoAttributes'][number]['kind'],
  question: string,
  rest: Partial<StudyDesign['egoAttributes'][number]> = {},
) => ({
  id,
  label,
  kind,
  question,
  options: [],
  optionScores: [],
  numberRange: [],
  required: false,
  ...rest,
});

const WHO5 = [
  'At no time',
  'Some of the time',
  'Less than half of the time',
  'More than half of the time',
  'Most of the time',
  'All of the time',
];
const who5 = (id: string, label: string, item: string) =>
  A(id, label, 'ordered', `Over the last two weeks: ${item}`, {
    options: WHO5,
    optionScores: [0, 1, 2, 3, 4, 5],
    required: true,
  });

export const friendshipDescription =
  'I study how first-year university students form friendships during their first semester, and whether having friends who drink heavily is linked to their own drinking and wellbeing.';

export const friendshipDesign: StudyDesign = {
  workingTitle: 'First-semester friendships, drinking and wellbeing',
  summary:
    "First-year university students map the friendships they have formed during their first semester. The study links the drinking of a student's friends to the student's own drinking (AUDIT-C) and wellbeing (WHO-5).",
  rationale:
    'One person node type keeps everyone on a single map. A quick-add name generator capped at 20 people keeps the network small enough for a sociogram, which collects "know each other" ties and drinking companions in one place. Bins collect closeness, how people met and perceived heavy drinking with little burden. The validated AUDIT-C and WHO-5 items come after the network task, and the drinking-amount items are skipped for non-drinkers.',
  administration: 'face_to_face',
  qualitative: true,
  includeConsent: true,
  consentText:
    'This study asks about the friends you have made since starting university, about drinking alcohol, and about how you have been feeling. It takes about 20 minutes. Your answers are confidential, and you can stop at any time.',
  egoAttributes: [
    A('age', 'Age', 'number', 'How old are you?', {
      numberRange: [16, 99],
      required: true,
    }),
    A('gender', 'Gender', 'single_choice', 'How do you describe your gender?', {
      options: [
        'Woman',
        'Man',
        'Non-binary',
        'Another gender',
        'Prefer not to say',
      ],
    }),
    A(
      'lives_in_halls',
      'Lives in halls',
      'yes_no',
      'Do you live in university accommodation (halls)?',
    ),
    A(
      'audit_frequency',
      'AUDIT-C frequency',
      'ordered',
      'How often do you have a drink containing alcohol?',
      {
        options: [
          'Never',
          'Monthly or less',
          '2 to 4 times a month',
          '2 to 3 times a week',
          '4 or more times a week',
        ],
        optionScores: [0, 1, 2, 3, 4],
        required: true,
      },
    ),
    A(
      'audit_typical',
      'AUDIT-C typical amount',
      'ordered',
      'How many drinks containing alcohol do you have on a typical day when you are drinking?',
      {
        options: ['1 or 2', '3 or 4', '5 or 6', '7 to 9', '10 or more'],
        optionScores: [0, 1, 2, 3, 4],
      },
    ),
    A(
      'audit_heavy',
      'AUDIT-C heavy episodes',
      'ordered',
      'How often do you have six or more drinks on one occasion?',
      {
        options: [
          'Never',
          'Less than monthly',
          'Monthly',
          'Weekly',
          'Daily or almost daily',
        ],
        optionScores: [0, 1, 2, 3, 4],
      },
    ),
    who5(
      'who5_cheerful',
      'WHO-5 cheerful',
      'I have felt cheerful and in good spirits.',
    ),
    who5('who5_calm', 'WHO-5 calm', 'I have felt calm and relaxed.'),
    who5('who5_active', 'WHO-5 active', 'I have felt active and vigorous.'),
    who5('who5_rested', 'WHO-5 rested', 'I woke up feeling fresh and rested.'),
    who5(
      'who5_interest',
      'WHO-5 interest',
      'My daily life has been filled with things that interest me.',
    ),
  ],
  nodeTypes: [
    {
      id: 'person',
      singular: 'Person',
      plural: 'People',
      represents: 'people',
      nameQuestion:
        "What is this person's first name or a nickname you will recognise?",
      attributes: [
        A('new_friend', 'New friend this semester', 'yes_no', ''),
        A('support', 'Turns to for support', 'yes_no', ''),
        A(
          'is_first_year',
          'Also a first-year',
          'yes_no',
          'Is this person also a first-year student?',
          { options: ['Yes', "No, or I'm not sure"] },
        ),
        A(
          'first_met',
          'When first met',
          'month_year',
          'When did you first meet this person?',
        ),
        A('closeness', 'Closeness', 'ordered', '', {
          options: ['Not very close', 'Somewhat close', 'Close', 'Very close'],
        }),
        A('how_met', 'How met', 'single_choice', '', {
          options: [
            'Same accommodation',
            'Same course',
            'Club or society',
            'Through other friends',
            'Knew before university',
          ],
        }),
        A('drinks_heavily', 'Drinks heavily', 'single_choice', '', {
          options: ['Yes', 'No', "I don't know"],
        }),
        A('drinks_with', 'Drinks with participant', 'yes_no', ''),
        A('drink_together_freq', 'How often drink together', 'ordered', '', {
          options: [
            'Less than monthly',
            'Monthly',
            'Weekly',
            'Several times a week',
          ],
        }),
      ],
    },
  ],
  relationships: [{ id: 'knows', name: 'Know each other', attributes: [] }],
  stages: [
    {
      kind: 'information',
      id: 'welcome',
      purpose: 'Welcome the participant and explain the study.',
      interviewerNote: '',
      skipLogic: always,
      role: 'welcome',
      content:
        'Thank you for taking part. We will ask about the people you have got to know since starting university, about drinking, and about how you have been feeling.',
    },
    {
      kind: 'egoForm',
      id: 'about_you',
      purpose: 'Basic demographics.',
      interviewerNote: '',
      skipLogic: always,
      attributeIds: ['age', 'gender', 'lives_in_halls'],
    },
    {
      kind: 'nameGenerator',
      id: 'name_friends',
      purpose:
        'Elicit friends and the people the participant spends time with at university.',
      interviewerNote: '',
      skipLogic: always,
      nodeTypeId: 'person',
      method: 'quick_add',
      attributeIds: [],
      prompts: [
        {
          text: 'Since **starting university this semester**, who have you **become friends with**?',
          tagAttributeId: 'new_friend',
        },
        {
          text: 'Who do you **spend most of your free time with** at university?',
          tagAttributeId: '',
        },
        {
          text: 'Who would you **turn to for support** if something was worrying you?',
          tagAttributeId: 'support',
        },
      ],
      minNodes: 0,
      maxNodes: 20,
    },
    {
      kind: 'alterForm',
      id: 'friend_details',
      purpose: 'When and where each tie formed.',
      interviewerNote: '',
      skipLogic: always,
      nodeTypeId: 'person',
      filter: noFilter,
      attributeIds: ['is_first_year', 'first_met'],
    },
    {
      kind: 'bins',
      id: 'friend_bins',
      purpose:
        'Closeness, how they met, and perceived heavy drinking for everyone named.',
      interviewerNote: '',
      skipLogic: always,
      nodeTypeId: 'person',
      filter: noFilter,
      prompts: [
        {
          text: 'Drag each person into the box that best describes **how close you feel** to them.',
          attributeId: 'closeness',
          allowOther: false,
        },
        {
          text: 'How did you **first meet** each person?',
          attributeId: 'how_met',
          allowOther: true,
        },
        {
          text: 'As far as you know, does each person often **drink heavily** (five or more drinks on one occasion)?',
          attributeId: 'drinks_heavily',
          allowOther: false,
        },
      ],
    },
    {
      kind: 'sociogram',
      id: 'friend_map',
      purpose:
        'Arrange the network, record who knows whom, and mark drinking companions.',
      interviewerNote: '',
      skipLogic: always,
      nodeTypeId: 'person',
      filter: noFilter,
      prompts: [
        {
          task: 'position',
          text: 'Place the people you are **closest to** nearest the centre.',
          relationshipId: '',
          attributeId: '',
        },
        {
          task: 'connect',
          text: 'Draw a line between any two people who **know each other**.',
          relationshipId: 'knows',
          attributeId: '',
        },
        {
          task: 'highlight',
          text: 'Tap everyone you **usually drink alcohol with**.',
          relationshipId: '',
          attributeId: 'drinks_with',
        },
      ],
    },
    {
      kind: 'bins',
      id: 'drinking_together',
      purpose: 'How often the participant drinks with each drinking companion.',
      interviewerNote: '',
      skipLogic: {
        mode: 'show_only_if',
        whenSkipped: 'next_stage',
        match: 'all',
        conditions: [
          {
            about: 'nodes',
            typeId: 'person',
            attributeId: 'drinks_with',
            operator: 'is',
            value: 'yes',
          },
        ],
      },
      nodeTypeId: 'person',
      filter: {
        match: 'all',
        conditions: [
          { attributeId: 'drinks_with', operator: 'is', value: 'yes' },
        ],
      },
      prompts: [
        {
          text: 'How often do you **drink alcohol together** with each person?',
          attributeId: 'drink_together_freq',
          allowOther: false,
        },
      ],
    },
    {
      kind: 'egoForm',
      id: 'your_drinking',
      purpose: 'AUDIT-C item 1.',
      interviewerNote: '',
      skipLogic: always,
      attributeIds: ['audit_frequency'],
    },
    {
      kind: 'egoForm',
      id: 'drinking_amount',
      purpose: 'AUDIT-C items 2 and 3, not asked of non-drinkers.',
      interviewerNote: '',
      skipLogic: {
        mode: 'skip_if',
        whenSkipped: 'next_stage',
        match: 'all',
        conditions: [
          {
            about: 'participant',
            typeId: '',
            attributeId: 'audit_frequency',
            operator: 'is',
            value: 'Never',
          },
        ],
      },
      attributeIds: ['audit_typical', 'audit_heavy'],
    },
    {
      kind: 'egoForm',
      id: 'wellbeing',
      purpose: 'WHO-5 wellbeing index.',
      interviewerNote: '',
      skipLogic: always,
      attributeIds: [
        'who5_cheerful',
        'who5_calm',
        'who5_active',
        'who5_rested',
        'who5_interest',
      ],
    },
    {
      kind: 'narrative',
      id: 'review',
      purpose:
        'Discuss the map: heavy drinking, drinking companions and where friendships formed.',
      interviewerNote: '',
      skipLogic: always,
      nodeTypeId: 'person',
      filter: noFilter,
      views: [
        {
          label: 'Who drinks heavily',
          groupByAttributeId: 'drinks_heavily',
          relationshipIds: ['knows'],
          highlightAttributeIds: [],
        },
        {
          label: 'Who you drink with',
          groupByAttributeId: '',
          relationshipIds: ['knows'],
          highlightAttributeIds: ['drinks_with'],
        },
        {
          label: 'How you met',
          groupByAttributeId: 'how_met',
          relationshipIds: [],
          highlightAttributeIds: [],
        },
      ],
    },
    {
      kind: 'information',
      id: 'thanks',
      purpose: 'Thank the participant and list support resources.',
      interviewerNote: '',
      skipLogic: always,
      role: 'closing',
      content:
        'Thank you for taking part. If anything in this interview has worried you, your university student support or wellbeing service can help, and your doctor can give confidential advice about drinking.',
    },
  ],
};

export const friendshipWording: Wording = {
  protocolName: 'First-Year Friendships and Drinking',
  protocolDescription:
    "Maps the friendships first-year students form in their first semester and links friends' drinking to the participant's own drinking (AUDIT-C) and wellbeing (WHO-5).",
  stages: [
    {
      stageKey: 'welcome',
      label: 'Welcome',
      title: 'Welcome to the study',
      text: 'Thank you for taking part. We will ask about the people you have got to know since starting university, about drinking, and about how you have been feeling.',
    },
    { stageKey: 'consent', label: 'Consent', title: 'Taking part', text: '' },
    {
      stageKey: 'about_you',
      label: 'About you',
      title: 'A little about you',
      text: 'First, a few questions about yourself.',
    },
    { stageKey: 'name_friends', label: 'Naming friends', title: '', text: '' },
    {
      stageKey: 'friend_details',
      label: 'Friend details',
      title: 'About the people you named',
      text: 'Next, two quick questions about each person.',
    },
    {
      stageKey: 'friend_bins',
      label: 'Closeness, meeting, drinking',
      title: '',
      text: '',
    },
    { stageKey: 'friend_map', label: 'Friendship map', title: '', text: '' },
    {
      stageKey: 'drinking_together',
      label: 'Drinking together',
      title: '',
      text: '',
    },
    {
      stageKey: 'your_drinking',
      label: 'Your drinking',
      title: 'Your drinking',
      text: 'These questions are about your own drinking.',
    },
    {
      stageKey: 'drinking_amount',
      label: 'Drinking amount',
      title: 'Your drinking',
      text: 'A little more about how much you drink.',
    },
    {
      stageKey: 'wellbeing',
      label: 'Wellbeing (WHO-5)',
      title: 'How you have been feeling',
      text: 'Please think about the last two weeks.',
    },
    {
      stageKey: 'review',
      label: 'Talking about your map',
      title: '',
      text: '',
    },
    { stageKey: 'thanks', label: 'Thank you', title: 'Thank you', text: '' },
  ],
  prompts: [
    {
      promptKey: 'name_friends/p1',
      text: 'Since **starting university this semester**, who have you **become friends with**?',
      negativeLabel: '',
    },
  ],
  questions: [{ questionKey: 'ego/age', text: 'What is your age in years?' }],
};
