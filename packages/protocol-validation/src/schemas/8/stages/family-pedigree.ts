import {
  getEdgeTypeId,
  getEdgeVariableId,
  getNodeTypeId,
  getNodeVariableId,
} from '~/utils/mock-seeds';
import { z } from '~/utils/zod-mock-extension';

import {
  FormFieldSchema,
  familyPedigreeNominationPromptSchema,
} from '../common';
import {
  asEntityAttributeReference,
  entityAttributeReference,
} from '../entity-attribute-reference';
import { baseStageSchema } from './base';

export const NodeConfigSchema = z.strictObject({
  // Node type for alter nodes in the codebook
  type: z.string().generateMock(() => getNodeTypeId()),
  // Text variable used to store the node's display label
  nodeLabelVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }).generateMock(() => asEntityAttributeReference(getNodeVariableId())),
  // Boolean variable marking the ego node
  egoVariable: entityAttributeReference({
    subject: 'ego',
  }).generateMock(() => asEntityAttributeReference(getNodeVariableId())),
  // Categorical variable storing the biological sex of the node (male, female, intersex, unknown)
  biologicalSexVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }).generateMock(() => asEntityAttributeReference(getNodeVariableId())),
  // String variable storing the relationship to ego (e.g. 'sibling', 'parent')
  relationshipVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }).generateMock(() => asEntityAttributeReference(getNodeVariableId())),
  // Optional form fields collected when creating a node
  form: z.array(FormFieldSchema).optional(),
});

export const EdgeConfigSchema = z.strictObject({
  // Edge type in the codebook (single type for both parent and partner edges)
  type: z.string().generateMock(() => getEdgeTypeId()),
  // Variable storing the relationship type value (discriminant for the Edge union)
  relationshipTypeVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }).generateMock(() => asEntityAttributeReference(getEdgeVariableId())),
  // Variable storing whether the relationship is currently active
  isActiveVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }).generateMock(() => asEntityAttributeReference(getEdgeVariableId())),
  // Variable storing gestational carrier status (parent edges only)
  isGestationalCarrierVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }).generateMock(() => asEntityAttributeReference(getEdgeVariableId())),
});

export const familyPedigreeStage = baseStageSchema.extend({
  type: z.literal('FamilyPedigree'),
  nodeConfig: NodeConfigSchema,
  edgeConfig: EdgeConfigSchema,

  // Prompt shown during the family building phase
  censusPrompt: z.string(),
  // Optional attribute nomination steps (e.g. disease nomination)
  nominationPrompts: z.array(familyPedigreeNominationPromptSchema).optional(),
});
