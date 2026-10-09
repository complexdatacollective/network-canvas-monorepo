import { z } from 'zod';

import type { MessageArguments } from '../../../localization/messageArguments.ts';
import { duplicateIdRefinement } from '../../../utils/validation-helpers.ts';
import {
  TitlelessFormSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import {
  FRAMING_SETTINGS,
  PEDIGREE_COMPLETENESS_SCOPES,
  PEDIGREE_GENDER_WORDS,
} from '../family-pedigree-values.ts';
import {
  localizedMessage,
  localizedString,
  nonBlankText,
} from '../localized-string.ts';
import {
  asksGenderIdentity,
  choosesFraming,
} from '../stage-wording/family-pedigree.ts';
import { categoricalOptionValueSchema } from '../variables/variable.ts';
import { baseStageSchema } from './base.ts';

/**
 * Stable identities for the pedigree's structural slots — the attributes the
 * interface derives from the family the participant draws, which nothing else
 * in the protocol may also write. Architect's slot pickers name them to exempt
 * themselves from the exclusivity check.
 */
export const FAMILY_PEDIGREE_SLOTS = {
  egoAttribute: 'familyPedigree.nodeConfiguration.egoAttribute',
  relationshipKindAttribute: 'familyPedigree.edgeConfiguration.kindAttribute',
  gestationalCarrierAttribute:
    'familyPedigree.edgeConfiguration.gestationalCarrierAttribute',
  currentPartnerAttribute:
    'familyPedigree.edgeConfiguration.currentPartnerAttribute',
  relativesNotRecordedAttribute:
    'familyPedigree.completeness.relativesNotRecordedAttribute',
  relationshipToParticipantAttribute:
    'familyPedigree.nodeConfiguration.relationshipToParticipantAttribute',
} as const;

/**
 * Which kinship words one gender identity option takes. `value` is the option's
 * value in the bound attribute's codebook options.
 */
const GenderIdentityTermSchema = z.strictObject({
  value: categoricalOptionValueSchema,
  words: z.enum(PEDIGREE_GENDER_WORDS),
});

/**
 * Collecting gender identity, which is optional.
 *
 * - Absent: the participant is not asked about gender identity. The gendered
 *   framing's words follow sex assigned at birth instead: female takes
 *   feminine words, male masculine words, and anything else or unanswered
 *   neutral ones.
 * - Present: the participant is asked, and `terms` decides the words. An
 *   option whose words are `unknown`, or an unanswered question, names a
 *   biological parent from sex assigned at birth ("biological mother").
 *
 * The gamete framing is unaffected: it never uses gendered words.
 *
 * The researcher defines the attribute's options, but the options are managed
 * by this stage: they can be added, removed, relabelled or re-valued only from
 * the pedigree stage that binds the attribute (see `stageManagedOptions`), so
 * the words below cannot drift from them. No other stage may manage the same
 * attribute's options, because its words would not follow an edit made here. Other parts of the protocol may still
 * write the attribute. A `terms` entry whose value is not (or is no longer) one
 * of the attribute's options is ignored by the interview, as if the option had
 * been left out; no value may be listed twice.
 */
const GenderIdentitySchema = z.strictObject({
  // Categorical attribute holding gender identity. (A person's symbol is the
  // person type's codebook shape, which the researcher may map to this or to
  // sex assigned at birth.)
  attribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    stageManagedOptions: {
      owner: 'the kinship words each option takes',
    },
  }),
  // Which kinship words each option takes (mother or father, sister or
  // brother, parent or sibling). An option not listed takes neutral words.
  // `unknown` marks an option meaning the person's gender is not known, so a
  // biological parent is named from their sex assigned at birth ("biological
  // mother").
  terms: z.array(GenderIdentityTermSchema),
});

/**
 * Binds the interface to the person node type: the attributes it records about
 * every family member. The name, gender identity (where asked) and sex
 * assigned at birth are asked in the side panel, before any researcher-defined
 * field; the participant marker is set by the interface itself.
 */
export const NodeConfigurationSchema = z.strictObject({
  // Text attribute holding the person's name, typed in the side panel.
  nameAttribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'validatedAttribute',
    requireType: ['text'],
  }),
  // The question asking that name, and the hint beneath it, worded like a
  // form field's prompt and hint. Network Canvas supplies both.
  nameField: z.strictObject({
    prompt: localizedString(nonBlankText(), 'plain'),
    hint: localizedString(nonBlankText(), 'plain').optional(),
  }),
  // Optional: the gender identity question and the words it decides. See
  // `GenderIdentitySchema`.
  genderIdentity: GenderIdentitySchema.optional(),
  // Categorical attribute holding sex assigned at birth.
  sexAssignedAtBirthAttribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    ownedOptions: 'pedigreeSexAssignedAtBirth',
  }),
  // Boolean attribute marking the participant.
  egoAttribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.egoAttribute,
      owner: 'the Family Pedigree interface, which marks the participant',
    },
  }),
  // Optional: a categorical attribute holding each person's relationship to
  // the participant (`PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT`), so that later
  // stages can filter and skip on it. Worked out from the family, not asked:
  // written for everyone connected to the participant each time they leave
  // the stage, and cleared for anyone no longer connected.
  relationshipToParticipantAttribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.relationshipToParticipantAttribute,
      owner:
        "the Family Pedigree interface, which records each person's relationship to the participant",
    },
    ownedOptions: 'pedigreeRelationshipToParticipant',
  }).optional(),
});

/**
 * Binds the interface to the edge type every family relationship is stored as,
 * and the attributes the interface writes onto it.
 */
export const EdgeConfigurationSchema = z.strictObject({
  type: entityTypeReference({ entity: 'edge' }),
  // Categorical attribute holding the relationship's kind: partner, or the
  // kind of parent the edge's source is to its target.
  kindAttribute: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.relationshipKindAttribute,
      owner:
        'the Family Pedigree interface, which records the kind of each family relationship',
    },
    ownedOptions: 'pedigreeRelationship',
  }),
  // Boolean attribute on a parent edge: this parent carried the pregnancy.
  // Any kind of parent but a partner may have carried it: a biological,
  // adoptive or social parent who carried the child (a legal co-mother who
  // gave birth is an adoptive or social parent who carried), a donor who
  // carried (a traditional surrogate), or a surrogate, who always did. A
  // child has at most one parent who carried them. Never set on a partner or
  // twin edge.
  gestationalCarrierAttribute: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.gestationalCarrierAttribute,
      owner:
        'the Family Pedigree interface, which records who carried each pregnancy',
    },
  }),
  // Boolean attribute on a partner edge: the partnership is current.
  currentPartnerAttribute: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.currentPartnerAttribute,
      owner:
        'the Family Pedigree interface, which records whether a partnership is current',
    },
  }),
});

/**
 * What the tracker's wording about one person may use: whether that person
 * is the participant (`isYou` is `true`), so the text can say "you", and
 * their name as the participant has it.
 */
export const PEDIGREE_PERSON_ARGUMENTS = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text' },
} as const satisfies MessageArguments;

const personMessage = () =>
  localizedMessage(nonBlankText(), { arguments: PEDIGREE_PERSON_ARGUMENTS });

/**
 * The tracker's wording, by the kind of thing it says is missing
 * (`CompletenessItem.kind` in the interview): the entry in its list
 * (`listItem`), the button recording that a person has no siblings or
 * children (`noneButton`), and the side panel's question about them
 * (`question`). Network Canvas supplies all of it.
 */
const CompletenessTextSchema = z.strictObject({
  parents: z.strictObject({
    listItem: personMessage(),
  }),
  siblings: z.strictObject({
    listItem: personMessage(),
    noneButton: personMessage(),
    question: personMessage(),
  }),
  children: z.strictObject({
    listItem: personMessage(),
    noneButton: personMessage(),
    question: personMessage(),
  }),
  details: z.strictObject({
    listItem: personMessage(),
  }),
});

/**
 * How much of the family the participant must record before continuing.
 * `recommended` lets them continue after being shown what is missing;
 * `required` does not.
 */
export const CompletenessSchema = z.strictObject({
  scope: z.enum(PEDIGREE_COMPLETENESS_SCOPES),
  enforcement: z.enum(['required', 'recommended']),
  // Categorical attribute on a person recording that they have no siblings
  // or children, or that the participant does not know of any.
  relativesNotRecordedAttribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.relativesNotRecordedAttribute,
      owner:
        'the Family Pedigree interface, which records relatives a participant says are not in their family',
    },
    ownedOptions: 'pedigreeRelativesNotRecorded',
  }),
  itemText: CompletenessTextSchema,
  // Shown under the tracker when the family is only recommended. Kept under
  // either enforcement, so switching between them loses no wording.
  recommendedNote: localizedString(nonBlankText(), 'plain'),
});

/**
 * The prompt id the interview gives the family-building step, which comes
 * before every nomination prompt; a nomination prompt may not reuse it.
 */
export const FAMILY_PEDIGREE_BUILD_PROMPT_ID = 'pedigree';

/**
 * A question asked of the whole family once it is drawn, such as "Who in
 * your family has had heart disease?". The participant selects everyone it
 * applies to, which sets a boolean attribute to true on them. Selecting
 * someone again deselects them and sets it to false; anyone never selected
 * has it unset.
 */
const NominationPromptSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .refine((id) => id !== FAMILY_PEDIGREE_BUILD_PROMPT_ID, {
      message: `Nomination prompt id "${FAMILY_PEDIGREE_BUILD_PROMPT_ID}" is reserved for building the family`,
    }),
  text: localizedString(z.string().min(1), 'markdown'),
  attribute: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
  }),
  // Limits the question to people of one sex assigned at birth, for a
  // condition only they can have: people recorded as the other sex cannot be
  // selected. Anyone else can, including people whose sex at birth is
  // intersex, unknown, or not recorded.
  onlyForSexAssignedAtBirth: z.enum(['female', 'male']).optional(),
});

/** Every kinship term the relative label may name. */
export const PEDIGREE_RELATIVE_TERMS = [
  'mother',
  'father',
  'parent',
  'eggParent',
  'spermParent',
  'biologicalMother',
  'biologicalFather',
  'adoptiveMother',
  'adoptiveFather',
  'adoptiveParent',
  'stepmother',
  'stepfather',
  'stepparent',
  'eggDonor',
  'spermDonor',
  'donor',
  'surrogate',
  'daughter',
  'son',
  'child',
  'stepdaughter',
  'stepson',
  'stepchild',
  'donorConceivedChild',
  'surrogacyChild',
  'sister',
  'brother',
  'sibling',
  'halfSister',
  'halfBrother',
  'halfSibling',
  'adoptiveSister',
  'adoptiveBrother',
  'adoptiveSibling',
  'stepsister',
  'stepbrother',
  'stepsibling',
  'partner',
  'formerPartner',
  'grandmother',
  'grandfather',
  'grandparent',
  'maternalGrandmother',
  'maternalGrandfather',
  'maternalGrandparent',
  'paternalGrandmother',
  'paternalGrandfather',
  'paternalGrandparent',
  'greatGrandmother',
  'greatGrandfather',
  'greatGrandparent',
  'stepGrandmother',
  'stepGrandfather',
  'stepGrandparent',
  'granddaughter',
  'grandson',
  'grandchild',
  'greatGranddaughter',
  'greatGrandson',
  'greatGrandchild',
  'aunt',
  'uncle',
  'maternalAunt',
  'maternalUncle',
  'paternalAunt',
  'paternalUncle',
  'parentsSibling',
  'greatAunt',
  'greatUncle',
  'grandparentsSibling',
  'niece',
  'nephew',
  'siblingsChild',
  'cousin',
  'motherInLaw',
  'fatherInLaw',
  'parentInLaw',
  'sisterInLaw',
  'brotherInLaw',
  'siblingInLaw',
  'daughterInLaw',
  'sonInLaw',
  'childInLaw',
] as const;

const SELECT_TRUE = { kind: 'select', cases: ['true'] } as const;
const TEXT = { kind: 'text' } as const;
const PLURAL = { kind: 'plural' } as const;

/** What a message about two people may use: whether the first is the participant. */
const TWO_PEOPLE_ARGUMENTS = {
  firstIsYou: SELECT_TRUE,
  first: TEXT,
  second: TEXT,
} as const satisfies MessageArguments;

/** What a message about a family member and one of their twins may use:
 * whether either is the participant. */
const TWIN_PAIR_ARGUMENTS = {
  who: { kind: 'select', cases: ['personIsYou', 'twinIsYou'] },
  name: TEXT,
  twin: TEXT,
} as const satisfies MessageArguments;

/** What a message about who carried a child may use: whether the person who
 * carried, or the child, is the participant. */
const CARRIER_ARGUMENTS = {
  who: { kind: 'select', cases: ['carrierIsYou', 'childIsYou'] },
  carrier: TEXT,
  child: TEXT,
} as const satisfies MessageArguments;

/**
 * What each of the Family Pedigree's wording settings with arguments may use,
 * by setting. A `select` argument lists the cases the message chooses between
 * (`other` is always allowed), a `plural` argument is a count, and a `text`
 * argument is shown as it is.
 */
export const PEDIGREE_WORDING_ARGUMENTS = {
  biologicalParentBoth: TWO_PEOPLE_ARGUMENTS,
  carriedSiblingsPregnancyLabel: {
    single: SELECT_TRUE,
    count: TEXT,
    ...PEDIGREE_PERSON_ARGUMENTS,
  },
  changeWouldCutOff: { count: PLURAL, names: TEXT },
  connectParent: {
    parentIsYou: SELECT_TRUE,
    parent: TEXT,
    childIsYou: SELECT_TRUE,
    child: TEXT,
  },
  connectPartners: { current: SELECT_TRUE, ...TWO_PEOPLE_ARGUMENTS },
  connectQuestion: TWO_PEOPLE_ARGUMENTS,
  disconnectConfirmTitle: TWO_PEOPLE_ARGUMENTS,
  disconnectWouldCutOff: { count: PLURAL, names: TEXT },
  generatedLabelOf: {
    relation: {
      kind: 'select',
      cases: ['partner', 'formerPartner', 'parent', 'sibling', 'owner'],
    },
    isYou: SELECT_TRUE,
    term: TEXT,
    name: TEXT,
    owner: TEXT,
  },
  missingDetailsList: { details: TEXT },
  panelTitle: {
    relation: {
      kind: 'select',
      cases: ['edit', 'parent', 'sibling', 'partner'],
    },
    ...PEDIGREE_PERSON_ARGUMENTS,
  },
  parentCarriedLabel: {
    named: SELECT_TRUE,
    parentIsYou: SELECT_TRUE,
    parent: TEXT,
  },
  parentKindCarrier: { parentKind: TEXT },
  parentLinkKindLabel: {
    parentIsYou: SELECT_TRUE,
    personIsYou: SELECT_TRUE,
    parent: TEXT,
  },
  placeholderParentsNote: {
    framing: { kind: 'select', cases: ['gamete'] },
  },
  relativeTerm: {
    term: { kind: 'select', cases: PEDIGREE_RELATIVE_TERMS },
  },
  removeConfirmDescription: {
    hasOthers: SELECT_TRUE,
    count: PLURAL,
    names: TEXT,
  },
  removeConfirmTitle: { name: TEXT },
  sharedDonorsLabel: PEDIGREE_PERSON_ARGUMENTS,
  sharedParentCountLabel: PEDIGREE_PERSON_ARGUMENTS,
  sharedParentEggOnly: {
    parent: { kind: 'select', cases: ['egg'] },
    framing: { kind: 'select', cases: ['gamete'] },
  },
  siblingTwinLabel: PEDIGREE_PERSON_ARGUMENTS,
  stillTogetherLabel: {
    named: SELECT_TRUE,
    personIsYou: SELECT_TRUE,
    partner: TEXT,
    partnerIsYou: SELECT_TRUE,
  },
  twinsLabel: PEDIGREE_PERSON_ARGUMENTS,
  twinZygosityLabel: TWIN_PAIR_ARGUMENTS,
  unavailableAlreadyConnected: TWO_PEOPLE_ARGUMENTS,
  unavailableAncestor: {
    who: { kind: 'select', cases: ['parentIsYou', 'childIsYou'] },
    parent: TEXT,
    child: TEXT,
  },
  unavailableBothSameSex: { ...TWO_PEOPLE_ARGUMENTS, sex: TEXT },
  unavailableCannotCarry: {
    who: { kind: 'select', cases: ['you', 'this'] },
    name: TEXT,
    sex: TEXT,
  },
  unavailableCarried: {
    who: { kind: 'select', cases: ['personIsYou', 'childIsYou'] },
    child: TEXT,
    sex: TEXT,
  },
  unavailableCarrierChoice: CARRIER_ARGUMENTS,
  unavailableCarrierRecorded: CARRIER_ARGUMENTS,
  unavailableGeneticParentsFull: {
    who: { kind: 'select', cases: ['childIsYou', 'includesYou'] },
    child: TEXT,
    first: TEXT,
    second: TEXT,
  },
  unavailableIdenticalTwin: TWIN_PAIR_ARGUMENTS,
  unavailableIdenticalTwinNew: PEDIGREE_PERSON_ARGUMENTS,
  unavailableSameSexGeneticParent: {
    who: { kind: 'select', cases: ['coParentIsYou', 'childIsYou'] },
    coParent: TEXT,
    child: TEXT,
    sex: TEXT,
  },
} as const satisfies Readonly<Record<string, MessageArguments>>;

type WordingWithArguments = keyof typeof PEDIGREE_WORDING_ARGUMENTS;

const plainWording = () => localizedString(nonBlankText(), 'plain');

const argumentWording = (key: WordingWithArguments) =>
  localizedMessage(nonBlankText(), {
    arguments: PEDIGREE_WORDING_ARGUMENTS[key],
  });

/**
 * The words the interface shows a participant on this stage, which Network
 * Canvas supplies (`stage-wording/family-pedigree.ts`). A key is named for
 * the message's id in the interface's catalog, so the translations keep the
 * names their messages were written with.
 *
 * The framing words and the gender identity question are shown only in some
 * configurations: they are optional here, and required by the stage while
 * their configuration is on (see `CONFIGURED_WORDING`).
 */
export const FamilyPedigreeWordingSchema = z.strictObject({
  alsoParentOfLabel: plainWording(),
  biologicalParentBoth: argumentWording('biologicalParentBoth'),
  biologicalParentHint: plainWording(),
  biologicalParentLabel: plainWording(),
  carriedSiblingsPregnancyLabel: argumentWording(
    'carriedSiblingsPregnancyLabel',
  ),
  carrierLabel: plainWording(),
  carrierUnknown: plainWording(),
  changeWouldCutOff: argumentWording('changeWouldCutOff'),
  childKindAdoptive: plainWording(),
  childKindBiological: plainWording(),
  childKindDonor: plainWording(),
  childKindLabel: plainWording(),
  childKindSocial: plainWording(),
  childKindSurrogate: plainWording(),
  connectHint: plainWording(),
  connectParent: argumentWording('connectParent'),
  connectPartners: argumentWording('connectPartners'),
  connectQuestion: argumentWording('connectQuestion'),
  disconnectConfirmDescription: plainWording(),
  disconnectConfirmTitle: argumentWording('disconnectConfirmTitle'),
  disconnectHint: plainWording(),
  disconnectWouldCutOff: argumentWording('disconnectWouldCutOff'),
  dontKnow: plainWording(),
  framingChoiceDescription: plainWording().optional(),
  framingChoiceTitle: plainWording().optional(),
  genderIdentityLabel: plainWording().optional(),
  generatedLabelOf: argumentWording('generatedLabelOf'),
  missingDetailsList: argumentWording('missingDetailsList'),
  otherParentLabel: plainWording(),
  otherParentNone: plainWording(),
  otherParentUnknown: plainWording(),
  panelTitle: argumentWording('panelTitle'),
  parentCarriedLabel: argumentWording('parentCarriedLabel'),
  parentKindCarrier: argumentWording('parentKindCarrier'),
  parentKindLabel: plainWording(),
  parentLinkKindLabel: argumentWording('parentLinkKindLabel'),
  parentPartnerLabel: plainWording(),
  placeholderParentsNote: argumentWording('placeholderParentsNote'),
  relativeTerm: argumentWording('relativeTerm'),
  removeConfirmDescription: argumentWording('removeConfirmDescription'),
  removeConfirmTitle: argumentWording('removeConfirmTitle'),
  sexAssignedAtBirthLabel: plainWording(),
  sharedDonorsLabel: argumentWording('sharedDonorsLabel'),
  sharedParentCountBoth: plainWording(),
  sharedParentCountLabel: argumentWording('sharedParentCountLabel'),
  sharedParentEggOnly: argumentWording('sharedParentEggOnly'),
  siblingBiologicalParentLabel: plainWording(),
  siblingKindLabel: plainWording(),
  siblingTwinFraternal: plainWording(),
  siblingTwinHint: plainWording(),
  siblingTwinIdentical: plainWording(),
  siblingTwinLabel: argumentWording('siblingTwinLabel'),
  siblingTwinNo: plainWording(),
  siblingTwinUnknown: plainWording(),
  stillTogetherLabel: argumentWording('stillTogetherLabel'),
  twinsHint: plainWording(),
  twinsLabel: argumentWording('twinsLabel'),
  twinZygosityLabel: argumentWording('twinZygosityLabel'),
  unavailableAlreadyConnected: argumentWording('unavailableAlreadyConnected'),
  unavailableAncestor: argumentWording('unavailableAncestor'),
  unavailableBothSameSex: argumentWording('unavailableBothSameSex'),
  unavailableCannotCarry: argumentWording('unavailableCannotCarry'),
  unavailableCarried: argumentWording('unavailableCarried'),
  unavailableCarrierChoice: argumentWording('unavailableCarrierChoice'),
  unavailableCarrierRecorded: argumentWording('unavailableCarrierRecorded'),
  unavailableGeneticParentsFull: argumentWording(
    'unavailableGeneticParentsFull',
  ),
  unavailableIdenticalTwin: argumentWording('unavailableIdenticalTwin'),
  unavailableIdenticalTwinNew: argumentWording('unavailableIdenticalTwinNew'),
  unavailableSameSexGeneticParent: argumentWording(
    'unavailableSameSexGeneticParent',
  ),
  zygosityFraternal: plainWording(),
  zygosityIdentical: plainWording(),
  zygosityUnknown: plainWording(),
  you: plainWording(),
  save: plainWording(),
  connectTool: plainWording(),
  disconnectTool: plainWording(),
  framingControlLabel: plainWording().optional(),
  pointerTool: plainWording(),
});

export type FamilyPedigreeWording = z.infer<typeof FamilyPedigreeWordingSchema>;

/**
 * The words that are required only while a configuration is on, with that
 * configuration. The stage refuses to hold one of them missing while the
 * configuration applies, and a researcher who switches the configuration off
 * keeps the words.
 */
const CONFIGURED_WORDING = [
  {
    key: 'framingChoiceTitle',
    applies: choosesFraming,
    requiredWhen: 'participants choose the words',
  },
  {
    key: 'framingChoiceDescription',
    applies: choosesFraming,
    requiredWhen: 'participants choose the words',
  },
  {
    key: 'framingControlLabel',
    applies: choosesFraming,
    requiredWhen: 'participants choose the words',
  },
  {
    key: 'genderIdentityLabel',
    applies: asksGenderIdentity,
    requiredWhen: 'the stage asks about gender identity',
  },
] as const;

/**
 * The stage a participant draws their family on.
 *
 * The canvas opens on the participant. A person's add menu (parent, sibling,
 * partner or child) shows while the pointer is over them or keyboard focus is
 * on them, and after a tap once their details panel closes; selecting a person
 * opens their details in a side panel. Each new person is described in that
 * panel: the interface's own questions (name, gender identity where asked,
 * sex assigned at birth), how they are related to the person they are added
 * to, and then the researcher's `form` fields.
 */
export const familyPedigreeStage = baseStageSchema
  .extend({
    type: z.literal('FamilyPedigree'),
    subject: NodeStageSubjectSchema,
    prompt: localizedString(z.string().min(1), 'markdown'),
    nodeConfiguration: NodeConfigurationSchema,
    edgeConfiguration: EdgeConfigurationSchema,
    // Which words describe family members, or `participantPreference` to let
    // the participant choose. Absent: `gendered`.
    framing: z.enum(FRAMING_SETTINGS).optional(),
    // Absent: the participant may continue with any family they have drawn.
    completeness: CompletenessSchema.optional(),
    // Researcher-defined person fields, asked after the interface's own.
    form: TitlelessFormSchema.optional(),
    // Asked in turn once the family is drawn, each its own prompt.
    nominationPrompts: z
      .array(NominationPromptSchema)
      .min(1)
      .superRefine(duplicateIdRefinement('Nomination prompts'))
      .optional(),
    // The words the interface shows, which Network Canvas supplies.
    wording: FamilyPedigreeWordingSchema,
  })
  .superRefine((stage, ctx) => {
    for (const { key, applies, requiredWhen } of CONFIGURED_WORDING) {
      if (applies(stage) && stage.wording[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `The "${key}" wording is required when ${requiredWhen}.`,
          path: ['wording', key],
        });
      }
    }
  });

export type FamilyPedigreeStageDefinition = z.infer<typeof familyPedigreeStage>;
export type FamilyPedigreeNodeConfiguration = z.infer<
  typeof NodeConfigurationSchema
>;
export type FamilyPedigreeEdgeConfiguration = z.infer<
  typeof EdgeConfigurationSchema
>;
export type FamilyPedigreeCompleteness = z.infer<typeof CompletenessSchema>;
export type FamilyPedigreeNominationPrompt = z.infer<
  typeof NominationPromptSchema
>;
