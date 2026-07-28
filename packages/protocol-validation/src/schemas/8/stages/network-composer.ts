import { z } from 'zod';

import { findDuplicateName } from '../../../utils/validation-helpers.ts';
import {
  EdgeStageSubjectSchema,
  imageOrCirclesBackgroundSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { ComponentTypes } from '../variables/types.ts';
import {
  datePickerParametersSchema,
  relativeDatePickerParametersSchema,
} from '../variables/variable.ts';
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
export const ComposerFormFieldSchema = z
  .strictObject({
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
  })
  .superRefine((field, ctx) => {
    // A DatePicker/RelativeDatePicker field's `parameters` must satisfy the
    // same shape and refinement as the codebook variable's own DatePicker/
    // RelativeDatePicker parameters (see variable.ts) — otherwise a stage
    // field could carry an out-of-resolution or min>max window the codebook
    // schema would reject anywhere else. Every other component's parameters
    // keep the unrestricted record shape above: `field.parameters` there
    // stays a loose `Record<string, unknown>` rather than narrowing per
    // component, matching how interview's forms.ts consumes it.
    const parametersSchema =
      field.component === ComponentTypes.DatePicker
        ? datePickerParametersSchema
        : field.component === ComponentTypes.RelativeDatePicker
          ? relativeDatePickerParametersSchema
          : undefined;
    if (!parametersSchema) return;
    const result = parametersSchema.optional().safeParse(field.parameters);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: 'custom' as const,
        message: issue.message,
        path: ['parameters', ...issue.path],
      });
    }
  });
export type ComposerFormField = z.infer<typeof ComposerFormFieldSchema>;

// Title-less, and (unlike TitlelessFormSchema) `fields` is optional / may be
// empty — a stage can have no editable attributes, and the editor's `prune`
// strips an empty fields array on save. The runtime renders "No attributes to
// edit" for an empty/absent form.
export const ComposerFormSchema = z.strictObject({
  fields: z
    .array(ComposerFormFieldSchema)
    .superRefine((fields, ctx) => {
      // Thirteenth-wave Finding 1: one form may not write the same variable
      // twice. Every field renders under its variable's name (interview's
      // useProtocolForm passes `name: field.variable` to each Field), so two
      // fields for one variable collide on a single form value while each
      // still contributing its own component/parameters and validation — two
      // required DatePicker fields pinned to disjoint singleton windows would
      // leave no satisfiable answer. The stage-effective overlay in schema.ts
      // cannot catch that either: it keys by variable, so only the last
      // field's overrides survive. Two fields writing one attribute is
      // incoherent authoring whatever the parameters, so reject the second
      // occurrence outright. The scope is one form: nodeForm and each edge
      // type's form resolve their references against different subjects, so
      // they are checked independently (the codebook separately forbids one
      // variable key from spanning entity types, so a shared key cannot in
      // practice reach both).
      const seen = new Set<string>();
      for (const [index, field] of fields.entries()) {
        if (seen.has(field.variable)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Network Composer form fields contain duplicate variable "${field.variable}"`,
            path: [index, 'variable'],
          });
          continue;
        }
        seen.add(field.variable);
      }
    })
    .optional(),
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
  background: imageOrCirclesBackgroundSchema,
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
