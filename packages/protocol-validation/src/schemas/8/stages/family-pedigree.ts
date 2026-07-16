import { z } from 'zod';

import { FRAMING_IDS } from '@codaco/shared-consts';
import {
  duplicateIdRefinement,
  findDuplicateId,
} from '~/utils/validation-helpers';

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

// The intro screen reuses the Information stage's text/asset content model, but
// its own schema: the pedigree intro editor has no item-resizing UI, so — unlike
// the Information stage — intro asset items carry no `size`.
const introScreenBaseItem = z.strictObject({
  id: z.string(),
  content: z.string(),
  description: z.string().optional(),
});

const IntroScreenItemSchema = z.discriminatedUnion('type', [
  introScreenBaseItem.extend({ type: z.literal('text') }),
  introScreenBaseItem.extend({ type: z.literal('asset') }),
]);

export type FamilyPedigreeIntroItem = z.infer<typeof IntroScreenItemSchema>;

export const NodeConfigSchema = z.strictObject({
  // Node type for alter nodes in the codebook
  type: entityTypeReference({ entity: 'node' }),
  // Text variable used to store the node's display label
  nodeLabelVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
  }),
  // Boolean variable marking the ego node
  egoVariable: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
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
  // Reuses the Information stage's content-item model: an ordered list of text
  // and asset sections.
  introScreen: z
    .object({
      items: z
        .array(IntroScreenItemSchema)
        .superRefine(duplicateIdRefinement('Intro screen items')),
    })
    .optional(),
  // Prompt shown during the family building phase
  censusPrompt: z.string().min(1),
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

// Config types, the single source of truth for the FamilyPedigree stage shape.
// Consumers (e.g. @codaco/protocol-utilities) derive from these rather than
// hand-mirroring, so they cannot drift from the schema.
export type FamilyPedigreeStageDefinition = z.infer<typeof familyPedigreeStage>;
// Node/edge config and nomination prompts contain entityAttributeReference
// fields, which the schema brands on parse (`string & $brand<…>`). Builders that
// assemble a stage from plain ids *before* validation (e.g. the synthetic
// interview builder) need the pre-parse `z.input` shape, where those references
// are still plain strings.
export type FamilyPedigreeNodeConfigInput = z.input<typeof NodeConfigSchema>;
export type FamilyPedigreeEdgeConfigInput = z.input<typeof EdgeConfigSchema>;
export type FamilyPedigreeNominationPromptInput = z.input<
  typeof familyPedigreeNominationPromptSchema
>;
// Framing, boundaries, and intro-screen items contain no branded references, so
// input and output shapes are identical.
export type FamilyPedigreeFraming = FamilyPedigreeStageDefinition['framing'];
export type FamilyPedigreeBoundaries =
  FamilyPedigreeStageDefinition['boundaries'];
