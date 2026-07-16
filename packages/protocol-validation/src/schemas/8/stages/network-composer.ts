import { z } from 'zod';

import { findDuplicateName } from '../../../utils/validation-helpers.ts';
import {
  EdgeStageSubjectSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { ComponentTypes } from '../variables/types.ts';
import { baseStageSchema } from './base.ts';

// Every input control the form system can render. Layout/location variables
// have no participant-facing control, so they are intentionally absent.
const ComposerComponentSchema = z.enum([
  ComponentTypes.Text,
  ComponentTypes.TextArea,
  ComponentTypes.Number,
  ComponentTypes.RadioGroup,
  ComponentTypes.CheckboxGroup,
  ComponentTypes.Boolean,
  ComponentTypes.Toggle,
  ComponentTypes.ToggleButtonGroup,
  ComponentTypes.VisualAnalogScale,
  ComponentTypes.LikertScale,
  ComponentTypes.DatePicker,
  ComponentTypes.RelativeDatePicker,
]);

// NetworkComposer attribute fields differ from the shared FormFieldSchema:
// the input control (`component`) and its parameters live on the STAGE here,
// not on the codebook variable, so the same variable can render with different
// controls in different stages. The runtime side panel reads the control from
// this field (see interview/src/selectors/forms.ts). `label` captions the
// field in the drawer; it is optional — the drawer falls back to the codebook
// variable's name.
export const ComposerFormFieldSchema = z.strictObject({
  // Architect assigns a stable id (uuid) on creation so the editor's
  // OrderedList / motion Reorder keying survives reorder + delete; it is
  // persisted, so the schema must tolerate it.
  id: z.string().optional(),
  variable: entityAttributeReference({ subject: 'stageSubject' }),
  component: ComposerComponentSchema,
  parameters: z.record(z.string(), z.unknown()).optional(),
  label: z.string().optional(),
  hint: z.string().optional(),
  showValidationHints: z.boolean().optional(),
});
export type ComposerFormField = z.infer<typeof ComposerFormFieldSchema>;

// Title-less, and (unlike TitlelessFormSchema) `fields` is optional / may be
// empty — a stage can have no editable attributes, and the editor's `prune`
// strips an empty fields array on save. The runtime renders "No attributes to
// edit" for an empty/absent form.
export const ComposerFormSchema = z.strictObject({
  fields: z.array(ComposerFormFieldSchema).optional(),
});
export type ComposerForm = z.infer<typeof ComposerFormSchema>;

export const networkComposerStage = baseStageSchema.extend({
  type: z.literal('NetworkComposer'),
  subject: NodeStageSubjectSchema,
  // The text variable populated by the inline quick-add name field when a node
  // is added from the tool palette.
  quickAdd: entityAttributeReference({ subject: 'stageSubject' }),
  // The layout variable that stores each node's { x, y } position.
  layoutVariable: entityAttributeReference({ subject: 'stageSubject' }),
  // Attribute form shown in the inspector when a node is selected.
  nodeForm: ComposerFormSchema.optional(),
  // The categorical variable whose values are drawn as convex hulls.
  // Participants toggle a node's group membership (a value of this variable)
  // via the Groups tool or by lasso-selecting nodes; membership also drives
  // the automatic layout's group-cohesion force.
  convexHullVariable: entityAttributeReference({
    subject: 'stageSubject',
  }).optional(),
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
  // Optional: a stage may define no edge types, and the editor's `prune` strips
  // an empty edges array on save (so it arrives undefined, not []).
  edges: z
    .array(
      z.strictObject({
        id: z.string(),
        subject: EdgeStageSubjectSchema,
        form: ComposerFormSchema.optional(),
      }),
    )
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
    })
    .optional(),
});
