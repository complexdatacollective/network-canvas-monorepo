import { z } from 'zod';

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
import { localizedString } from '../localized-string.ts';
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
    singleStage: {
      reason: 'each decides the kinship words each of its options takes',
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
  // the stage, and cleared for anyone of the type outside that family. So
  // one stage records it: another, drawing a family of its own, would clear
  // the first one's.
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
    singleStage: {
      reason:
        "each works out every person's relationship to the participant from its own family, and clears it from anyone outside that family",
    },
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
