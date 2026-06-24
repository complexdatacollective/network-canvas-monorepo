import {
  getEdgeTypeId,
  getEdgeVariableId,
  getNodeTypeId,
  getNodeVariableId,
} from '~/utils/mock-seeds';
import { findDuplicateId } from '~/utils/validation-helpers';
import { z } from '~/utils/zod-mock-extension';

import {
  FormFieldSchema,
  familyPedigreeNominationPromptSchema,
} from '../common';
import { baseStageSchema } from './base';

// Reserved id used by the interview for the synthetic census/scaffolding prompt;
// an author-supplied nomination prompt may not reuse it (collides at runtime).
const RESERVED_NOMINATION_PROMPT_ID = 'scaffolding';

export const NodeConfigSchema = z.strictObject({
  // Node type for alter nodes in the codebook
  type: z.string().generateMock(() => getNodeTypeId()),
  // Text variable used to store the node's display label
  nodeLabelVariable: z.string().generateMock(() => getNodeVariableId()),
  // Boolean variable marking the ego node
  egoVariable: z.string().generateMock(() => getNodeVariableId()),
  // String variable storing the relationship to ego (e.g. 'sibling', 'parent')
  relationshipVariable: z.string().generateMock(() => getNodeVariableId()),
  // Optional form fields collected when creating a node
  form: z.array(FormFieldSchema).optional(),
});

export const EdgeConfigSchema = z.strictObject({
  // Edge type in the codebook (single type for both parent and partner edges)
  type: z.string().generateMock(() => getEdgeTypeId()),
  // Variable storing the relationship type value (discriminant for the Edge union)
  relationshipTypeVariable: z.string().generateMock(() => getEdgeVariableId()),
  // Variable storing whether the relationship is currently active
  isActiveVariable: z.string().generateMock(() => getEdgeVariableId()),
  // Variable storing gestational carrier status (parent edges only)
  isGestationalCarrierVariable: z
    .string()
    .generateMock(() => getEdgeVariableId()),
});

export const familyPedigreeStage = baseStageSchema.extend({
  type: z.literal('FamilyPedigree'),
  nodeConfig: NodeConfigSchema,
  edgeConfig: EdgeConfigSchema,

  // Prompt shown during the family building phase
  censusPrompt: z.string(),
  // Optional attribute nomination steps (e.g. disease nomination)
  nominationPrompts: z
    .array(familyPedigreeNominationPromptSchema)
    .optional()
    .superRefine((prompts, ctx) => {
      if (!prompts) {
        return;
      }

      const duplicatePromptId = findDuplicateId(prompts);
      if (duplicatePromptId) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Nomination prompts contain duplicate ID "${duplicatePromptId}"`,
          path: [],
        });
      }

      if (
        prompts.some((prompt) => prompt.id === RESERVED_NOMINATION_PROMPT_ID)
      ) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Nomination prompt id "${RESERVED_NOMINATION_PROMPT_ID}" is reserved`,
          path: [],
        });
      }
    }),
});
