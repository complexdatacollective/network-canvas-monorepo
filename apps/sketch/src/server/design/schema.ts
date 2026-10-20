// The three model-facing output schemas:
//   Screening   (step 1, "Reading your research questions", Haiku 5.5)
//   StudyDesign (step 2, "Designing the study", Opus 5.5 / OpenAI flagship)
//   Wording     (step 3, "Writing titles and prompts", cheap model)
//
// Each is turned into ONE JSON Schema by toProviderJsonSchema (./json-schema.ts)
// and sent unchanged to Anthropic (output_config.format, type json_schema) and
// OpenAI Responses (text.format, type json_schema, strict: true).
//
// Provider rules this file obeys BY CONSTRUCTION (asserted by json-schema.test.ts):
//   - every key required: "no value" is '' or [] (never .optional/.nullable/.default)
//   - z.object only (-> additionalProperties:false everywhere)
//   - no .min/.max/.length/.int/.regex/.email etc. (bounds live in analyse.ts / compile.ts)
//   - primitive enums only; stage discriminators are z.literal (normalised to enum:[x])
//   - no recursion; root is an object
//   - EXACTLY ONE union in the whole StudyDesign schema: StageSchema (11 branches).
//     Anthropic allows 16 union-typed parameters per request; each anyOf or type
//     array counts once. Do not add a second union without re-running the
//     union-count test.
//   - never .describe() a field whose schema carries .meta({ id }): that would
//     emit a $ref with sibling keys. Describe the shared schema itself instead.
//
// The compiler owns every mechanical decision: codebook keys, variable names,
// variable types, input controls, option values, colours, shapes, icons, stage
// and prompt ids, layout variables, panels, canvas layout mode and background,
// consent wiring, asset ids, skip destinations and auto-skips. This schema only
// asks for study-design judgements and draft text.
//
// Long guidance (method choice by network size, stage order, burden) lives in
// the cached system prompt; descriptions here stay short.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const Id = (what: string) =>
  z
    .string()
    .describe(
      `snake_case id you choose for this ${what} (lowercase letters, digits, underscore), e.g. "close_friend". Other fields refer to it by exactly this id.`,
    );

const Ref = (what: string) =>
  z.string().describe(`Id of ${what}, or "" when not applicable.`);

const Text = (what: string) => z.string().describe(what);

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export const ATTRIBUTE_KINDS = [
  'text',
  'long_text',
  'number',
  'yes_no',
  'single_choice',
  'multi_choice',
  'ordered',
  'slider',
  'date',
  'month_year',
  'year',
] as const;
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number];

export const AttributeSchema = z
  .object({
    id: Id('attribute'),
    label: Text(
      'Short researcher-facing name, 1-4 words, e.g. "Drinking frequency".',
    ),
    question: Text(
      'Participant-facing question used when this is asked in a form, about "this person" for node attributes. "" if never asked in a form (prompt tags, sociogram highlights, bin-only attributes).',
    ),
    kind: z
      .enum(ATTRIBUTE_KINDS)
      .describe(
        'text = short free text; long_text = a paragraph; number = whole number; yes_no = yes/no (also prompt tags and highlights); single_choice = one unordered category; multi_choice = any number of unordered categories; ordered = one point on an ordered scale (closeness, frequency, agreement, validated instrument items); slider = continuous position between two labelled ends; date / month_year / year = calendar date at that precision.',
      ),
    options: z
      .array(z.string())
      .describe(
        'single_choice / multi_choice: 2-8 category labels. ordered: 2-7 labels from LOWEST to HIGHEST. slider: exactly [left end label, right end label]. yes_no: [] for Yes/No, or exactly [label for yes, label for no]. Other kinds: [].',
      ),
    optionScores: z
      .array(z.number())
      .describe(
        'ordered only, and only when reproducing a validated instrument with published item scoring: one whole-number score per option, same order (e.g. [0,1,2,3,4] for AUDIT-C). Otherwise [] and options are scored 1..n.',
      ),
    numberRange: z
      .array(z.number())
      .describe(
        'number only: [] for no limits, or exactly [minimum, maximum] as whole numbers, e.g. [16, 99]. Other kinds: [].',
      ),
    required: z
      .boolean()
      .describe(
        'true only for answers the analysis cannot do without. Keep sensitive questions optional.',
      ),
  })
  .meta({
    id: 'Attribute',
    description:
      'One thing recorded about the participant, a node or a relationship.',
  });

// ---------------------------------------------------------------------------
// Conditions: stage filters (which nodes) and skip logic (whether the stage shows)
// ---------------------------------------------------------------------------

export const OPERATORS = [
  'is',
  'is_not',
  'greater_than',
  'less_than',
  'at_least',
  'at_most',
  'includes',
  'excludes',
  'contains',
  'does_not_contain',
  'answered',
  'not_answered',
  'any_exist',
  'none_exist',
] as const;
export type Operator = (typeof OPERATORS)[number];

const OperatorSchema = z.enum(OPERATORS).meta({
  id: 'Operator',
  description:
    'yes_no: is / is_not with value "yes" or "no" (a node never tagged counts as "no"). single_choice / multi_choice: includes / excludes one option label. ordered: is / is_not / at_least / at_most / greater_than / less_than an option label, following option order. number: is / is_not / greater_than / less_than / at_least / at_most a number. text / long_text: contains / does_not_contain a word or phrase. Any kind: answered / not_answered (value ""). any_exist / none_exist: whether any node or relationship of typeId exists (attributeId "", value ""; skip logic only).',
});

const FilterConditionSchema = z
  .object({
    attributeId: Ref("an attribute of the stage's node type"),
    operator: OperatorSchema,
    value: Text(
      'Comparison value as text: an option LABEL, "yes"/"no", or a number. "" for answered / not_answered.',
    ),
  })
  .meta({
    id: 'FilterCondition',
    description: "A test on one attribute of the stage's node type.",
  });

export const NodeFilterSchema = z
  .object({
    match: z
      .enum(['all', 'any'])
      .describe('all = a node must pass every condition; any = at least one.'),
    conditions: z
      .array(FilterConditionSchema)
      .describe(
        '[] = every node of the stage node type (the usual case). Only attributes of that node type; never participant attributes.',
      ),
  })
  .meta({
    id: 'NodeFilter',
    description:
      'Which nodes this stage shows, e.g. only people tagged as drinking companions.',
  });

const SkipConditionSchema = z
  .object({
    about: z
      .enum(['participant', 'nodes', 'relationships'])
      .describe(
        'participant = an egoAttributes attribute. nodes = nodes of node type typeId. relationships = relationships of type typeId. For nodes / relationships, a condition alone holds when at least one node / tie matches. With match "all", every nodes condition must hold for the SAME node, and every relationships condition for the SAME tie, so do not combine conditions on different node types (or different relationship types) under "all". Counts cannot be expressed.',
      ),
    typeId: Ref(
      'the node type or relationship (about nodes / relationships); "" for participant',
    ),
    attributeId: Ref('the attribute tested; "" with any_exist / none_exist'),
    operator: OperatorSchema,
    value: Text(
      'Comparison value as text: an option LABEL, "yes"/"no", or a number. "" when the operator takes none.',
    ),
  })
  .meta({
    id: 'SkipCondition',
    description:
      'One test. It may only refer to things collected in EARLIER stages.',
  });

export const SkipLogicSchema = z
  .object({
    mode: z
      .enum(['always_show', 'show_only_if', 'skip_if'])
      .describe(
        'always_show = no condition (conditions must be []). show_only_if / skip_if = decided by conditions.',
      ),
    whenSkipped: z
      .enum(['next_stage', 'end_interview'])
      .describe(
        'Where the interview goes when this stage is not shown. next_stage unless nothing after it can apply.',
      ),
    match: z
      .enum(['all', 'any'])
      .describe('all = every condition must hold; any = at least one.'),
    conditions: z.array(SkipConditionSchema),
  })
  .meta({
    id: 'SkipLogic',
    description:
      'Whether this stage is shown. Use it to skip stages that cannot apply, e.g. drinking-amount questions for non-drinkers. Do not use it for consent: set includeConsent.',
  });

// ---------------------------------------------------------------------------
// Stages (the ONE union)
// ---------------------------------------------------------------------------

const stageCommon = {
  id: Id('stage'),
  purpose: Text(
    'One or two sentences for the research team and the writer: what this stage measures and why. Not shown to participants.',
  ),
  interviewerNote: Text(
    'A note for an interviewer administering this stage, or "". Never shown to participants.',
  ),
  skipLogic: SkipLogicSchema,
};
const nodeTypeRef = Ref('the node type this stage works with');
const promptText = Text(
  'Draft participant-facing instruction or question, one sentence; **bold** the key phrase. Name generators: a reference period plus the domain, e.g. "Since **starting university**, who have you **spent free time with**?"',
);

const InformationStage = z
  .object({
    kind: z.literal('information'),
    ...stageCommon,
    role: z.enum(['welcome', 'instructions', 'transition', 'closing']),
    content: Text(
      'Draft of what this screen must say (Markdown allowed). Closing screens on sensitive topics should list support resources.',
    ),
  })
  .describe(
    'A text-only screen: welcome, instructions, a transition, or thanks at the end.',
  );

const EgoFormStage = z
  .object({
    kind: z.literal('egoForm'),
    ...stageCommon,
    attributeIds: z
      .array(z.string())
      .describe('Ids from egoAttributes asked on this form, in order. 1-8.'),
  })
  .describe(
    'A form about the participant: demographics, own behaviour, outcome scales. Never a consent form.',
  );

const NameGeneratorStage = z
  .object({
    kind: z.literal('nameGenerator'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    method: z
      .enum(['quick_add', 'form', 'roster'])
      .describe(
        'quick_add = type a name only (fastest; default). form = name plus 1-3 attributeIds asked as each node is added. roster = pick from a list of a known population (a class, a ward) only when the description says such a list exists; a placeholder list is generated.',
      ),
    attributeIds: z
      .array(z.string())
      .describe(
        'form: 1-3 attributes of nodeTypeId asked after the name. roster: attributes the list holds for each row (text, number or yes_no), shown on cards. quick_add: [].',
      ),
    prompts: z
      .array(
        z.object({
          text: promptText,
          tagAttributeId: Ref(
            'a yes_no attribute of nodeTypeId set to yes for everyone named at this prompt',
          ),
        }),
      )
      .describe(
        '1-4 prompts on ONE theme. Use another nameGenerator stage for another theme.',
      ),
    minNodes: z
      .number()
      .describe(
        'Fewest nodes required before moving on; 0 when naming nobody is a legitimate answer.',
      ),
    maxNodes: z
      .number()
      .describe(
        'Most nodes allowed on this stage; 0 for no limit. Cap at 10-20 when relationship stages follow.',
      ),
  })
  .describe(
    'Elicits nodes (alters). The name is collected automatically: never declare a name attribute.',
  );

const AlterFormStage = z
  .object({
    kind: z.literal('alterForm'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    filter: NodeFilterSchema,
    attributeIds: z
      .array(z.string())
      .describe(
        'Attributes of nodeTypeId asked once per node, in order. 1-6; prefer bins for single ordered or categorical items.',
      ),
  })
  .describe('A form repeated for each named node.');

const RelationshipFormStage = z
  .object({
    kind: z.literal('relationshipForm'),
    ...stageCommon,
    relationshipId: Ref('the relationship'),
    attributeIds: z
      .array(z.string())
      .describe(
        'Attributes of relationshipId asked once per existing tie. 1-4.',
      ),
  })
  .describe(
    'A form repeated for each tie that already exists. Only after a stage that creates these ties.',
  );

const BinsStage = z
  .object({
    kind: z.literal('bins'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    filter: NodeFilterSchema,
    prompts: z
      .array(
        z.object({
          text: promptText,
          attributeId: Ref(
            'an ordered or single_choice attribute of nodeTypeId (never multi_choice: one drop replaces the answer)',
          ),
          allowOther: z
            .boolean()
            .describe(
              'single_choice only: add an "Other" bin with a free-text follow-up. false otherwise.',
            ),
        }),
      )
      .describe(
        '1-3 prompts; each sorts every node into the options of one attribute (ordered: at most 6 options; categories: at most 8).',
      ),
  })
  .describe(
    'Drag each node into a bin: the preferred way to record one ordered or categorical attribute about everyone.',
  );

const SociogramStage = z
  .object({
    kind: z.literal('sociogram'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    filter: NodeFilterSchema,
    prompts: z
      .array(
        z.object({
          task: z
            .enum(['position', 'connect', 'highlight'])
            .describe(
              'position = drag nodes onto concentric circles (closer to the centre = closer to the participant). connect = tap two nodes to create a tie of relationshipId. highlight = tap nodes to mark yes on attributeId.',
            ),
          text: promptText,
          relationshipId: Ref('the relationship created (task connect)'),
          attributeId: Ref('a yes_no attribute of nodeTypeId (task highlight)'),
        }),
      )
      .describe(
        '1-4 prompts on one shared map. Without a position prompt the layout is automatic.',
      ),
  })
  .describe(
    'A network map: the scalable way to collect ties between nodes and quick yes/no attributes.',
  );

const RelationshipCensusStage = z
  .object({
    kind: z.literal('relationshipCensus'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    filter: NodeFilterSchema,
    method: z
      .enum(['every_pair', 'one_at_a_time', 'with_strength'])
      .describe(
        'every_pair = a yes/no screen for every pair (under ~10 nodes). one_at_a_time = one node at a time, tap everyone tied to it from the rest (about 8-25 nodes). with_strength = every pair on an ordered strength scale (under ~10 nodes).',
      ),
    prompts: z
      .array(
        z.object({
          text: Text(
            'The question about a pair, e.g. "Do these two people **know each other**?"',
          ),
          relationshipId: Ref('the relationship created'),
          strengthAttributeId: Ref(
            'with_strength: an ordered attribute (2-5 options) of relationshipId',
          ),
          noTieLabel: Text(
            'with_strength: the "no tie" answer, e.g. "They don\'t know each other". "" otherwise.',
          ),
        }),
      )
      .describe('1-2 prompts.'),
  })
  .describe(
    'Asks systematically about ties between named nodes. Prefer a sociogram connect prompt for larger networks.',
  );

const NarrativeStage = z
  .object({
    kind: z.literal('narrative'),
    ...stageCommon,
    nodeTypeId: Ref('the node type (it must appear in an EARLIER sociogram)'),
    filter: NodeFilterSchema,
    views: z
      .array(
        z.object({
          label: Text(
            'Participant-visible name of this view, 1-4 words, e.g. "Who you drink with".',
          ),
          groupByAttributeId: Ref(
            'a single_choice or multi_choice attribute of nodeTypeId drawn as groups',
          ),
          relationshipIds: z
            .array(z.string())
            .describe('Relationships drawn as lines; [] for none.'),
          highlightAttributeIds: z
            .array(z.string())
            .describe(
              'yes_no attributes of nodeTypeId highlighted; [] for none.',
            ),
        }),
      )
      .describe('1-4 views, one discussion question each.'),
  })
  .describe(
    'A closing visualisation of the map for an interviewer to discuss with the participant. Collects no data. Only for face_to_face studies with a qualitative element.',
  );

const NetworkComposerStage = z
  .object({
    kind: z.literal('networkComposer'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    attributeIds: z
      .array(z.string())
      .describe(
        'Attributes of nodeTypeId the participant can fill in for each person on the canvas, in order. 0-4; never the groupAttributeId.',
      ),
    groupAttributeId: Ref(
      'a multi_choice attribute of nodeTypeId whose options are drawn as groups the participant puts people into',
    ),
    relationships: z
      .array(
        z.object({
          relationshipId: Ref('a relationship drawn on the canvas'),
          attributeIds: z
            .array(z.string())
            .describe(
              'Attributes of relationshipId asked about each tie drawn; [] for none.',
            ),
        }),
      )
      .describe('0-2 relationships the participant can draw.'),
  })
  .describe(
    'A free-form canvas on which the participant, guided by an interviewer, adds people, places them, groups them and draws ties while talking about their network. It creates nodes itself. Only for face_to_face studies with a qualitative element.',
  );

export const MAP_REGIONS = [
  'world',
  'europe',
  'africa',
  'asia',
  'middle_east',
  'north_america',
  'south_america',
  'oceania',
] as const;

const GeospatialStage = z
  .object({
    kind: z.literal('geospatial'),
    ...stageCommon,
    nodeTypeId: nodeTypeRef,
    filter: NodeFilterSchema,
    mapRegion: z.enum(MAP_REGIONS).describe('Where the world map opens.'),
    prompts: z
      .array(
        z.object({
          text: promptText,
          locationAttributeId: Id(
            'NEW country attribute this prompt records, e.g. "country_of_residence"; Sketch creates it, do not declare it in attributes',
          ),
        }),
      )
      .describe('1-2 prompts.'),
  })
  .describe(
    'Participant picks the COUNTRY of each node on a world map. Country level only; needs internet during the interview.',
  );

export const StageSchema = z.union([
  InformationStage,
  EgoFormStage,
  NameGeneratorStage,
  AlterFormStage,
  RelationshipFormStage,
  BinsStage,
  SociogramStage,
  RelationshipCensusStage,
  NarrativeStage,
  GeospatialStage,
  NetworkComposerStage,
]);
export const DESIGN_STAGE_KINDS = [
  'information',
  'egoForm',
  'nameGenerator',
  'alterForm',
  'relationshipForm',
  'bins',
  'sociogram',
  'relationshipCensus',
  'narrative',
  'geospatial',
  'networkComposer',
] as const;

// ---------------------------------------------------------------------------
// Entities and root
// ---------------------------------------------------------------------------

const NodeTypeSchema = z.object({
  id: Id('node type'),
  singular: Text(
    'Capitalised singular display name, e.g. "Person". Distinct from every other node type and relationship name.',
  ),
  plural: Text('e.g. "People".'),
  represents: z
    .enum(['people', 'places', 'organisations', 'other'])
    .describe('What the nodes stand for; picks the icon.'),
  nameQuestion: Text(
    'How participants identify each one, e.g. "What is this person\'s first name or a nickname you will recognise?"',
  ),
  attributes: z
    .array(AttributeSchema)
    .describe(
      'Everything recorded about each node, including yes_no prompt tags and highlights. Never a name or position attribute: Sketch adds those.',
    ),
});

const RelationshipSchema = z.object({
  id: Id('relationship'),
  name: Text(
    'Display name of this tie between two nodes, e.g. "Know each other". Distinct from every node type name.',
  ),
  attributes: z
    .array(AttributeSchema)
    .describe(
      'Recorded about each tie, usually []. A with_strength census needs one ordered attribute here.',
    ),
});

export const StudyDesignSchema = z
  .object({
    workingTitle: Text('Working title of the study, under 10 words.'),
    summary: Text(
      'Two or three sentences: the research question, the population, the network mapped and the key measures.',
    ),
    rationale: Text(
      '2-4 sentences for the researcher on the main design choices (no step-by-step reasoning).',
    ),
    administration: z
      .enum(['face_to_face', 'self_administered'])
      .describe(
        'face_to_face = an interviewer sits with the participant (clinic, field or lab interviews); self_administered = the participant completes it alone (online, on a kiosk or tablet). self_administered unless the description says interviewers run the interviews.',
      ),
    qualitative: z
      .boolean()
      .describe(
        'true only when the research design includes a qualitative or narrative element: the participant talks through their network with the interviewer, and that discussion is part of the data.',
      ),
    includeConsent: z
      .boolean()
      .describe(
        'true adds a standard consent question after the welcome screen; the interview ends if the participant declines.',
      ),
    consentText: Text(
      'includeConsent true: one paragraph on what taking part involves. Otherwise "".',
    ),
    egoAttributes: z
      .array(AttributeSchema)
      .describe(
        'Everything recorded about the participant. Never a consent attribute.',
      ),
    nodeTypes: z
      .array(NodeTypeSchema)
      .describe(
        'Usually ONE type (people). Distinguish roles with attributes so everyone appears on one map; split types only for genuinely different entities.',
      ),
    relationships: z
      .array(RelationshipSchema)
      .describe('Kinds of ties BETWEEN named nodes; [] if none are measured.'),
    stages: z
      .array(StageSchema)
      .describe(
        'The interview in order: welcome, participant questions, name generators, then stages about the named nodes and their ties, an optional narrative, then a closing screen. Every reference must point at something declared above.',
      ),
    burdenEstimate: z
      .object({
        expectedPeople: z
          .number()
          .describe('How many people a typical participant will name.'),
        screens: z
          .number()
          .describe(
            'Screens a typical participant sees at that size, counting a per-person form once per person and a pair census once per pair.',
          ),
        itemsPerPerson: z
          .number()
          .describe(
            'Questions answered about EACH named person: form questions, bins prompts, highlight and map prompts.',
          ),
        minutes: z.number().describe('Expected interview length in minutes.'),
      })
      .describe(
        'Your estimate of respondent burden for this design. Estimate honestly: it is compared against the compiled interview.',
      ),
  })
  .describe('A Network Canvas study design.');

export type StudyDesign = z.infer<typeof StudyDesignSchema>;
export type DesignStage = z.infer<typeof StageSchema>;
export type DesignAttribute = z.infer<typeof AttributeSchema>;
export type DesignSkipLogic = z.infer<typeof SkipLogicSchema>;
export type DesignNodeFilter = z.infer<typeof NodeFilterSchema>;

// ---------------------------------------------------------------------------
// Step 1: Screening (Haiku 5.5)
// ---------------------------------------------------------------------------

export const ScreeningSchema = z.object({
  isStudy: z
    .boolean()
    .describe(
      'true if the text describes, however vaguely, a study of people, their relationships or networks. false only when there is no study at all (empty, a greeting, an unrelated request).',
    ),
  summary: Text(
    'isStudy true: one sentence restating the study, shown in the progress list. Otherwise "".',
  ),
  refusalHint: Text(
    'isStudy false: one friendly sentence saying what to describe instead. Otherwise "".',
  ),
});

// ---------------------------------------------------------------------------
// Step 3: Wording (cheap model)
// Keys are handed to the model by buildWordingRequest(). Unknown keys are
// ignored and "" or missing entries fall back to the design's drafts and the
// compiler's defaults, so this step can never make a protocol invalid.
// Arrays keyed by id, because records cannot be strict.
// ---------------------------------------------------------------------------

export const WordingSchema = z.object({
  protocolName: Text(
    'Protocol title, at most 8 words, e.g. "First-Year Friendships and Drinking".',
  ),
  protocolDescription: Text(
    'Two or three sentences describing the protocol for researchers.',
  ),
  stages: z
    .array(
      z.object({
        stageKey: Text('A stage key exactly as given.'),
        label: Text('Researcher-facing stage label, at most 6 words.'),
        title: Text(
          'What the request says title means for this stage (screen title, introduction title). "" if it says none.',
        ),
        text: Text(
          'What the request says text means for this stage (screen body, introduction text; Markdown allowed). "" if it says none.',
        ),
      }),
    )
    .describe('One entry per stage key in the request.'),
  prompts: z
    .array(
      z.object({
        promptKey: Text('A prompt key exactly as given.'),
        text: Text(
          'Polished prompt. Keep the meaning, the reference period and the **bold** emphasis. View labels: 1-4 words.',
        ),
        negativeLabel: Text(
          'Only where the request marks the prompt as needing one: the "no tie" answer. Otherwise "".',
        ),
      }),
    )
    .describe('One entry per prompt key in the request.'),
  questions: z
    .array(
      z.object({
        questionKey: Text('A question key exactly as given.'),
        text: Text('The polished form question.'),
      }),
    )
    .describe('One entry per question key in the request.'),
});
export type Wording = z.infer<typeof WordingSchema>;
