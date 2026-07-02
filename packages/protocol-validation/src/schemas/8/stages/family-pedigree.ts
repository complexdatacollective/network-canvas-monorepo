import { z } from 'zod';

import { FRAMING_IDS } from '@codaco/shared-consts';
import { findDuplicateId } from '~/utils/validation-helpers';

import {
  FormFieldSchema,
  familyPedigreeNominationPromptSchema,
} from '../common';
import { entityAttributeReference } from '../entity-attribute-reference';
import { entityTypeReference } from '../entity-type-reference';
import { baseStageSchema } from './base';

// Reserved id used by the interview for the synthetic census/scaffolding prompt;
// an author-supplied nomination prompt may not reuse it (collides at runtime).
const RESERVED_NOMINATION_PROMPT_ID = 'scaffolding';

export const NodeConfigSchema = z.strictObject({
  // Node type for alter nodes in the codebook
  type: entityTypeReference({ entity: 'node' }),
  // Text variable used to store the node's display label
  nodeLabelVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }),
  // Boolean variable marking the ego node
  egoVariable: entityAttributeReference({
    subject: 'ego',
  }),
  // String variable storing the relationship to ego (e.g. 'sibling', 'parent')
  relationshipVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }),
  // Variable storing the biological sex of this node (female/male/intersex/unknown)
  biologicalSexVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }),
  // Optional form fields collected when creating a node
  form: z.array(FormFieldSchema).optional(),
});

export const EdgeConfigSchema = z.strictObject({
  // Edge type in the codebook (single type for both parent and partner edges)
  type: entityTypeReference({ entity: 'edge' }),
  // Variable storing the relationship type value (discriminant for the Edge union)
  relationshipTypeVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }),
  // Variable storing whether the relationship is currently active
  isActiveVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }),
  // Variable storing gestational carrier status (parent edges only)
  isGestationalCarrierVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }),
  // Variable storing the gamete role for this edge (which gamete each participant contributed)
  gameteRoleVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'edge' },
  }),
});

export const familyPedigreeStage = baseStageSchema.extend({
  type: z.literal('FamilyPedigree'),
  nodeConfig: NodeConfigSchema,
  edgeConfig: EdgeConfigSchema,

  // Framing determines the language used for parent roles (fixed to a specific
  // framing, or presented as a participant choice at interview time).
  framing: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('fixed'), value: z.enum([...FRAMING_IDS]) }),
    z.object({ mode: z.literal('participantChoice') }),
  ]),
  // Boundary enforcement settings controlling whether grandparents and
  // children contributors are required or recommended (or off).
  boundaries: z.object({
    requireGrandparents: z.enum(['required', 'recommended', 'off']),
    requireChildrenContributors: z.enum(['required', 'recommended', 'off']),
  }),
  // Optional introductory screen shown before the main pedigree-building step.
  introScreen: z
    .object({
      title: z.string().optional(),
      text: z.string(),
      videoAssetId: z.string().optional(),
    })
    .optional(),
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
