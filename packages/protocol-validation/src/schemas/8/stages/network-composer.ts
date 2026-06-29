import { z } from 'zod';

import { findDuplicateName } from '~/utils/validation-helpers';

import {
  EdgeStageSubjectSchema,
  NodeStageSubjectSchema,
  TitlelessFormSchema,
} from '../common';
import { entityAttributeReference } from '../entity-attribute-reference';
import { baseStageSchema } from './base';

export const networkComposerStage = baseStageSchema.extend({
  type: z.literal('NetworkComposer'),
  subject: NodeStageSubjectSchema,
  // The text variable populated by the inline quick-add name field when a node
  // is added from the tool palette.
  quickAdd: entityAttributeReference({ subject: 'stageSubject' }),
  // The layout variable that stores each node's { x, y } position.
  layoutVariable: entityAttributeReference({ subject: 'stageSubject' }),
  // Attribute form shown in the inspector when a node is selected.
  nodeForm: TitlelessFormSchema.optional(),
  // Categorical variables whose values are drawn as convex hulls. Participants
  // pick one variable at a time via the Groups tool and toggle a node's
  // membership in a group (a value of that variable).
  convexHulls: z
    .array(entityAttributeReference({ subject: 'stageSubject' }))
    .optional(),
  background: z
    .strictObject({
      image: z.string().optional(),
      concentricCircles: z.number().int().optional(),
      skewedTowardCenter: z.boolean().optional(),
    })
    .optional(),
  behaviours: z
    .strictObject({
      // Whether automatic (force-directed) layout is ON when the stage first
      // opens. A flat boolean, matching the shared canvas behaviours used by the
      // Sociogram and Narrative. Unlike those, NetworkComposer treats this only
      // as the DEFAULT: participants turn automatic layout on and off during the
      // interview via a toggle, and that live choice is persisted in stage
      // metadata (see NetworkComposerStageMetadataSchema).
      automaticLayout: z.boolean().optional(),
    })
    .optional(),
  // Each entry is a drawable edge type. `subject` carries the edge type so an
  // edge form's fields resolve their variable references against that edge type
  // (via collectEntityAttributeReferences' stageSubjectOf), not the node subject.
  edges: z
    .array(
      z.strictObject({
        id: z.string(),
        subject: EdgeStageSubjectSchema,
        form: TitlelessFormSchema.optional(),
      }),
    )
    .min(1)
    .superRefine((edges, ctx) => {
      const duplicateType = findDuplicateName(
        edges.map((edge) => edge.subject.type),
      );
      if (duplicateType) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Network Composer edges contain duplicate type "${duplicateType}"`,
          path: [],
        });
      }
    }),
});
