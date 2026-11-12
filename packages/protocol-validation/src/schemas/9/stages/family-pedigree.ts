import { z } from 'zod';

import {
  EVERY_VERSION,
  type MessageArguments,
  type RequiredPlacements,
} from '../../../localization/messageArguments.ts';
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
  type LocalizedString,
  localizedString,
  nonBlankText,
} from '../localized-string.ts';
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
  // form field's prompt and hint. Network Canvas supplies both, and the
  // interview always shows both: a stage holds either only where its author
  // changed the wording, or writes in a language Network Canvas has none in.
  nameField: z
    .strictObject({
      prompt: localizedString(nonBlankText(), {
        format: 'plain',
        lines: 'single',
      }).optional(),
      hint: localizedString(nonBlankText(), {
        format: 'markdown',
        lines: 'single',
      }).optional(),
    })
    .optional(),
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
 * What wording about one person may use: whether that person is the
 * participant (`isYou` is `true`), so the text can say "you", and their name
 * as the participant has it, which every version about someone else must
 * show. The tracker's texts and several of the stage's words share it.
 */
export const PEDIGREE_PERSON_ARGUMENTS = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text', required: [{ isYou: 'other' }] },
} as const satisfies MessageArguments;

const personMessage = () =>
  localizedMessage(nonBlankText(), {
    arguments: PEDIGREE_PERSON_ARGUMENTS,
  }).optional();

/**
 * The tracker's wording, by the kind of thing it says is missing
 * (`CompletenessItem.kind` in the interview): the entry in its list
 * (`listItem`), the button recording that a person has no siblings or
 * children (`noneButton`), and the side panel's question about them
 * (`question`). Network Canvas supplies all of it; the interview shows
 * Network Canvas's wording for any of it a stage omits.
 */
const CompletenessTextSchema = z.strictObject({
  parents: z
    .strictObject({
      listItem: personMessage(),
    })
    .optional(),
  siblings: z
    .strictObject({
      listItem: personMessage(),
      noneButton: personMessage(),
      question: personMessage(),
    })
    .optional(),
  children: z
    .strictObject({
      listItem: personMessage(),
      noneButton: personMessage(),
      question: personMessage(),
    })
    .optional(),
  details: z
    .strictObject({
      listItem: personMessage(),
    })
    .optional(),
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
  itemText: CompletenessTextSchema.optional(),
  // Shown under the tracker when the family is only recommended. Kept under
  // either enforcement, so switching between them loses no wording.
  recommendedNote: localizedString(nonBlankText(), {
    format: 'plain',
    lines: 'single',
  }).optional(),
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
  text: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'single' },
    {
      dynamicValues: 'prompt',
    },
  ),
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
const PLURAL = { kind: 'plural' } as const;

/** A value every version of the message must show. */
const SHOWN = { kind: 'text', required: EVERY_VERSION } as const;

/**
 * A value the message must show in the versions named: those whose select
 * cases include every case one of `versions` lists.
 */
const shownWhen = (...versions: RequiredPlacements) =>
  ({ kind: 'text', required: versions }) as const;

/**
 * What a message about two people may use: whether the first is the
 * participant. It names the second always, and the first unless they are the
 * participant.
 */
const TWO_PEOPLE_ARGUMENTS = {
  firstIsYou: SELECT_TRUE,
  first: shownWhen({ firstIsYou: 'other' }),
  second: SHOWN,
} as const satisfies MessageArguments;

/** What a message about a family member and one of their twins may use:
 * whether either is the participant. It names whoever is not. */
const TWIN_PAIR_ARGUMENTS = {
  who: { kind: 'select', cases: ['personIsYou', 'twinIsYou'] },
  name: shownWhen({ who: 'twinIsYou' }, { who: 'other' }),
  twin: shownWhen({ who: 'personIsYou' }, { who: 'other' }),
} as const satisfies MessageArguments;

/** What a message naming the answers it makes unavailable may use: the
 * answers, already joined into a list, which it must show, and how many
 * there are. */
const UNAVAILABLE_ANSWERS_ARGUMENTS = {
  answers: SHOWN,
  count: PLURAL,
} as const satisfies MessageArguments;

/**
 * What each of the Family Pedigree's wording settings with arguments may use,
 * by setting. A `select` argument lists the cases the message chooses between
 * (`other` is always allowed), a `plural` argument is a count, and a `text`
 * argument is shown as it is. Each says which versions of the message must
 * show it: a person is named wherever the message is not addressed to them
 * as "you", and a value the message is about (an answer, a kinship term) is
 * always shown. The same holds for Network Canvas's wording and for any
 * rewording or translation of it.
 */
export const PEDIGREE_WORDING_ARGUMENTS = {
  biologicalParentBoth: TWO_PEOPLE_ARGUMENTS,
  carriedSiblingsPregnancyLabel: {
    single: SELECT_TRUE,
    count: shownWhen({ single: 'other' }),
    isYou: SELECT_TRUE,
    name: shownWhen({ single: 'true', isYou: 'other' }),
  },
  changeWouldCutOff: { count: PLURAL, names: SHOWN },
  childKindDonor: { isYou: SELECT_TRUE },
  childKindSocial: { isYou: SELECT_TRUE },
  childKindSurrogate: { isYou: SELECT_TRUE },
  disconnectStandIn: {
    childIsYou: SELECT_TRUE,
    child: shownWhen({ childIsYou: 'other' }),
    standIn: SHOWN,
  },
  carrierReplaced: {
    answer: SHOWN,
    who: { kind: 'select', cases: ['carrierIsYou', 'childIsYou'] },
    carrier: shownWhen({ who: 'childIsYou' }, { who: 'other' }),
    child: shownWhen({ who: 'carrierIsYou' }, { who: 'other' }),
  },
  connectParent: {
    parentIsYou: SELECT_TRUE,
    parent: shownWhen({ parentIsYou: 'other' }),
    childIsYou: SELECT_TRUE,
    child: shownWhen({ childIsYou: 'other' }, { parentIsYou: 'true' }),
  },
  connectPartners: { current: SELECT_TRUE, ...TWO_PEOPLE_ARGUMENTS },
  connectQuestion: TWO_PEOPLE_ARGUMENTS,
  disconnectConfirmTitle: TWO_PEOPLE_ARGUMENTS,
  disconnectWouldCutOff: { count: PLURAL, names: SHOWN },
  geneticParentReplaced: {
    answer: SHOWN,
    who: { kind: 'select', cases: ['parentIsYou', 'childIsYou'] },
    parent: shownWhen({ who: 'childIsYou' }, { who: 'other' }),
    child: shownWhen({ who: 'parentIsYou' }, { who: 'other' }),
  },
  generatedLabelOf: {
    relation: {
      kind: 'select',
      cases: ['partner', 'formerPartner', 'parent', 'sibling', 'owner'],
    },
    isYou: SELECT_TRUE,
    term: SHOWN,
    // Someone else's relative is named after them, except where the label
    // names its owner instead.
    name: shownWhen(
      { relation: 'partner', isYou: 'other' },
      { relation: 'formerPartner', isYou: 'other' },
      { relation: 'parent', isYou: 'other' },
      { relation: 'sibling', isYou: 'other' },
      { relation: 'other', isYou: 'other' },
    ),
    owner: shownWhen({ relation: 'owner' }),
  },
  identicalTwinSharesParents: { ...TWIN_PAIR_ARGUMENTS, answer: SHOWN },
  otherParentBiologicalLabel: {
    otherIsYou: SELECT_TRUE,
    other: shownWhen({ otherIsYou: 'other' }),
  },
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
    parent: shownWhen({ named: 'true', parentIsYou: 'other' }),
  },
  parentKindCarrier: { parentKind: SHOWN },
  parentLinkKindLabel: {
    parentIsYou: SELECT_TRUE,
    personIsYou: SELECT_TRUE,
    parent: shownWhen({ parentIsYou: 'other' }),
    child: shownWhen({ personIsYou: 'other' }, { parentIsYou: 'true' }),
  },
  placeholderParentsNote: {
    shared: { kind: 'select', cases: ['eggParent', 'spermParent'] },
    framing: { kind: 'select', cases: ['gamete'] },
  },
  relativeTerm: {
    term: { kind: 'select', cases: PEDIGREE_RELATIVE_TERMS },
  },
  removeConfirmDescription: {
    hasOthers: SELECT_TRUE,
    count: PLURAL,
    names: shownWhen({ hasOthers: 'true' }),
  },
  removeConfirmTitle: { name: SHOWN },
  sexChangeClearsCoParentSex: {
    who: {
      kind: 'select',
      cases: ['personIsYou', 'childIsYou', 'coParentIsYou'],
    },
    coParent: shownWhen(
      { who: 'personIsYou' },
      { who: 'childIsYou' },
      { who: 'other' },
    ),
    children: shownWhen(
      { who: 'personIsYou' },
      { who: 'coParentIsYou' },
      { who: 'other' },
    ),
    sex: SHOWN,
  },
  sexChangeEndsCarrying: {
    who: { kind: 'select', cases: ['personIsYou', 'childIsYou'] },
    children: shownWhen({ who: 'personIsYou' }, { who: 'other' }),
    sex: SHOWN,
  },
  sharedDonorsLabel: {
    ...PEDIGREE_PERSON_ARGUMENTS,
    hasSurrogate: SELECT_TRUE,
  },
  sharedParentCountLabel: PEDIGREE_PERSON_ARGUMENTS,
  sharedParentEggOnly: {
    parent: { kind: 'select', cases: ['egg'] },
    framing: { kind: 'select', cases: ['gamete'] },
  },
  sharedParentsNotSibling: { ...PEDIGREE_PERSON_ARGUMENTS, chosen: SHOWN },
  sharedSurrogateLabel: PEDIGREE_PERSON_ARGUMENTS,
  siblingTwinLabel: PEDIGREE_PERSON_ARGUMENTS,
  standInPlaceTaken: {
    anchorIsYou: SELECT_TRUE,
    anchor: shownWhen({ anchorIsYou: 'other' }),
    count: PLURAL,
    names: SHOWN,
  },
  stillTogetherLabel: {
    named: SELECT_TRUE,
    personIsYou: SELECT_TRUE,
    partner: shownWhen(
      { named: 'true', partnerIsYou: 'other' },
      { named: 'true', personIsYou: 'true' },
    ),
    partnerIsYou: SELECT_TRUE,
  },
  twinsLabel: PEDIGREE_PERSON_ARGUMENTS,
  twinZygosityLabel: TWIN_PAIR_ARGUMENTS,
  unavailableAncestor: {
    who: { kind: 'select', cases: ['parentIsYou', 'childIsYou'] },
    parent: shownWhen({ who: 'childIsYou' }, { who: 'other' }),
    child: shownWhen({ who: 'parentIsYou' }, { who: 'other' }),
  },
  unavailableBothSameSex: {
    ...UNAVAILABLE_ANSWERS_ARGUMENTS,
    ...TWO_PEOPLE_ARGUMENTS,
    sex: SHOWN,
  },
  unavailableCannotCarry: {
    ...UNAVAILABLE_ANSWERS_ARGUMENTS,
    who: { kind: 'select', cases: ['you', 'this'] },
    name: shownWhen({ who: 'other' }),
    sex: SHOWN,
  },
  unavailableCarried: {
    who: { kind: 'select', cases: ['personIsYou', 'childIsYou'] },
    children: shownWhen({ who: 'personIsYou' }, { who: 'other' }),
    sex: SHOWN,
  },
  unavailableCarrierRecorded: {
    ...UNAVAILABLE_ANSWERS_ARGUMENTS,
    who: { kind: 'select', cases: ['carrierIsYou', 'childIsYou'] },
    carrier: shownWhen({ who: 'childIsYou' }, { who: 'other' }),
    child: shownWhen({ who: 'carrierIsYou' }, { who: 'other' }),
  },
  unavailableGeneticParentsFull: {
    ...UNAVAILABLE_ANSWERS_ARGUMENTS,
    who: { kind: 'select', cases: ['childIsYou', 'includesYou'] },
    child: shownWhen({ who: 'includesYou' }, { who: 'other' }),
    first: shownWhen({ who: 'childIsYou' }, { who: 'other' }),
    second: SHOWN,
  },
  unavailableSameSexGeneticParent: {
    ...UNAVAILABLE_ANSWERS_ARGUMENTS,
    who: { kind: 'select', cases: ['coParentIsYou', 'childIsYou'] },
    coParent: shownWhen({ who: 'childIsYou' }, { who: 'other' }),
    child: shownWhen({ who: 'coParentIsYou' }, { who: 'other' }),
    sex: SHOWN,
  },
} as const satisfies Readonly<Record<string, MessageArguments>>;

type WordingWithArguments = keyof typeof PEDIGREE_WORDING_ARGUMENTS;

const plainWording = () =>
  localizedString(nonBlankText(), {
    format: 'plain',
    lines: 'single',
  }).optional();

const argumentWording = (key: WordingWithArguments) =>
  localizedMessage(nonBlankText(), {
    arguments: PEDIGREE_WORDING_ARGUMENTS[key],
  }).optional();

/**
 * The words the interface shows a participant on this stage, which Network
 * Canvas supplies (`stage-wording/family-pedigree.ts`). A key is named for
 * the message's id in the interface's catalog, so the translations keep the
 * names their messages were written with. The tools, their hints and the
 * framing question, which every Family Pedigree shows alike, are interface
 * text (`interface-text-wording.ts`). A stage that omits a key shows Network
 * Canvas's wording for it.
 *
 * The gender identity question is shown only while the stage asks about
 * gender identity.
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
  carrierReplaced: argumentWording('carrierReplaced'),
  carrierUnknown: plainWording(),
  changeWouldCutOff: argumentWording('changeWouldCutOff'),
  childKindAdoptive: plainWording(),
  childKindBiological: plainWording(),
  childKindDonor: argumentWording('childKindDonor'),
  childKindLabel: plainWording(),
  childKindSocial: argumentWording('childKindSocial'),
  childKindSurrogate: argumentWording('childKindSurrogate'),
  connectParent: argumentWording('connectParent'),
  connectPartners: argumentWording('connectPartners'),
  connectQuestion: argumentWording('connectQuestion'),
  disconnectConfirmDescription: plainWording(),
  disconnectConfirmTitle: argumentWording('disconnectConfirmTitle'),
  disconnectStandIn: argumentWording('disconnectStandIn'),
  disconnectWouldCutOff: argumentWording('disconnectWouldCutOff'),
  genderIdentityLabel: plainWording(),
  generatedLabelOf: argumentWording('generatedLabelOf'),
  geneticParentReplaced: argumentWording('geneticParentReplaced'),
  identicalTwinSharesParents: argumentWording('identicalTwinSharesParents'),
  otherParentBiologicalLabel: argumentWording('otherParentBiologicalLabel'),
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
  sexChangeClearsCoParentSex: argumentWording('sexChangeClearsCoParentSex'),
  sexChangeEndsCarrying: argumentWording('sexChangeEndsCarrying'),
  sharedDonorsLabel: argumentWording('sharedDonorsLabel'),
  sharedParentCountBoth: plainWording(),
  sharedParentCountLabel: argumentWording('sharedParentCountLabel'),
  sharedParentEggOnly: argumentWording('sharedParentEggOnly'),
  sharedParentsNotSibling: argumentWording('sharedParentsNotSibling'),
  sharedSurrogateLabel: argumentWording('sharedSurrogateLabel'),
  siblingBiologicalParentLabel: plainWording(),
  siblingKindLabel: plainWording(),
  siblingOtherBiologicalParentLabel: plainWording(),
  siblingTwinFraternal: plainWording(),
  siblingTwinHint: plainWording(),
  siblingTwinIdentical: plainWording(),
  siblingTwinLabel: argumentWording('siblingTwinLabel'),
  siblingTwinNo: plainWording(),
  siblingTwinUnknown: plainWording(),
  standInPlaceTaken: argumentWording('standInPlaceTaken'),
  stillTogetherLabel: argumentWording('stillTogetherLabel'),
  twinsHint: plainWording(),
  twinsLabel: argumentWording('twinsLabel'),
  twinZygosityLabel: argumentWording('twinZygosityLabel'),
  unavailableAncestor: argumentWording('unavailableAncestor'),
  unavailableBothSameSex: argumentWording('unavailableBothSameSex'),
  unavailableCannotCarry: argumentWording('unavailableCannotCarry'),
  unavailableCarried: argumentWording('unavailableCarried'),
  unavailableCarrierRecorded: argumentWording('unavailableCarrierRecorded'),
  unavailableGeneticParentsFull: argumentWording(
    'unavailableGeneticParentsFull',
  ),
  unavailableSameSexGeneticParent: argumentWording(
    'unavailableSameSexGeneticParent',
  ),
  zygosityFraternal: plainWording(),
  zygosityIdentical: plainWording(),
  // The participant's own label, which may show their answers from earlier
  // in the interview, such as the name an Ego Form asked for.
  you: localizedString(
    nonBlankText(),
    { format: 'plain', lines: 'single' },
    { dynamicValues: 'stageText' },
  ).optional(),
});

export type FamilyPedigreeWording = z.infer<typeof FamilyPedigreeWordingSchema>;

/**
 * The Family Pedigree's wording with a text for every key: what the
 * interview shows, which is the stage's wording over Network Canvas's own.
 */
export type CompleteFamilyPedigreeWording = Readonly<{
  [Key in keyof FamilyPedigreeWording]-?: LocalizedString;
}>;

/** Whether `wording` has a text for every key of the stage's wording. */
export const isCompleteFamilyPedigreeWording = (
  wording: Readonly<Record<string, LocalizedString>>,
): wording is CompleteFamilyPedigreeWording =>
  Object.keys(FamilyPedigreeWordingSchema.shape).every((key) =>
    Object.hasOwn(wording, key),
  );

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
export const familyPedigreeStage = baseStageSchema.extend({
  type: z.literal('FamilyPedigree'),
  subject: NodeStageSubjectSchema,
  prompt: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'single' },
    {
      dynamicValues: 'prompt',
    },
  ),
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
  wording: FamilyPedigreeWordingSchema.optional(),
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
