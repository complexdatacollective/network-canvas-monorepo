import { z } from 'zod';

import {
  TitlelessFormSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { baseStageSchema } from './base.ts';

/**
 * Stable identities for the pedigree's structural slots — the attributes the
 * interface derives from the family the participant draws, which nothing else
 * in the protocol may also write. Architect's slot pickers name them to exempt
 * themselves from the exclusivity check.
 */
export const FAMILY_PEDIGREE_SLOTS = {
  egoVariable: 'familyPedigree.person.egoVariable',
  relationshipKindVariable: 'familyPedigree.relationship.kindVariable',
  gestationalCarrierVariable:
    'familyPedigree.relationship.gestationalCarrierVariable',
  currentPartnerVariable: 'familyPedigree.relationship.currentPartnerVariable',
} as const;

/**
 * The attributes on the person node type that the interface collects for
 * every family member, in the side panel, before any researcher-defined field.
 */
export const PersonAttributesSchema = z.strictObject({
  // Text attribute holding the person's name, shown beneath their symbol.
  nameVariable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'validatedAttribute',
    requireType: ['text'],
  }),
  // Categorical attribute holding gender identity; decides the symbol.
  genderIdentityVariable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    ownedOptions: 'pedigreeGenderIdentity',
  }),
  // Categorical attribute holding sex assigned at birth.
  sexAssignedAtBirthVariable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    ownedOptions: 'pedigreeSexAssignedAtBirth',
  }),
  // Boolean attribute marking the participant.
  egoVariable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.egoVariable,
      owner: 'the Family Pedigree interface, which marks the participant',
    },
  }),
});

/**
 * The edge type every family relationship is stored as, and the attributes the
 * interface writes onto it.
 */
export const RelationshipConfigSchema = z.strictObject({
  type: entityTypeReference({ entity: 'edge' }),
  // Categorical attribute holding the relationship's kind: partner, or the
  // kind of parent the edge's source is to its target.
  kindVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
    usage: 'unvalidatedAttribute',
    requireType: ['categorical'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.relationshipKindVariable,
      owner:
        'the Family Pedigree interface, which records the kind of each family relationship',
    },
    ownedOptions: 'pedigreeRelationship',
  }),
  // Boolean attribute on a parent edge: this parent carried the pregnancy.
  gestationalCarrierVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.gestationalCarrierVariable,
      owner:
        'the Family Pedigree interface, which records who carried each pregnancy',
    },
  }),
  // Boolean attribute on a partner edge: the partnership is current.
  currentPartnerVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
    usage: 'unvalidatedAttribute',
    requireType: ['boolean'],
    exclusive: {
      slot: FAMILY_PEDIGREE_SLOTS.currentPartnerVariable,
      owner:
        'the Family Pedigree interface, which records whether a partnership is current',
    },
  }),
});

/**
 * The stage a participant draws their family on.
 *
 * The canvas opens on the participant. Selecting anyone offers to add their
 * parent, sibling, partner or child; each new person is described in a side
 * panel that collects the interface's own person attributes, the attributes
 * the new relationship needs, and then the researcher's `form` fields.
 */
export const familyPedigreeStage = baseStageSchema.extend({
  type: z.literal('FamilyPedigree'),
  subject: NodeStageSubjectSchema,
  prompt: z.string().min(1),
  personAttributes: PersonAttributesSchema,
  relationship: RelationshipConfigSchema,
  // Researcher-defined person fields, asked after the interface's own.
  form: TitlelessFormSchema.optional(),
});

export type FamilyPedigreeStageDefinition = z.infer<typeof familyPedigreeStage>;
export type FamilyPedigreePersonAttributes = z.infer<
  typeof PersonAttributesSchema
>;
export type FamilyPedigreeRelationshipConfig = z.infer<
  typeof RelationshipConfigSchema
>;
