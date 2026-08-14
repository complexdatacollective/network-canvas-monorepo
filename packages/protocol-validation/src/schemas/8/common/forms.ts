import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';

export const FormFieldSchema = z.strictObject({
  // Architect assigns a stable id (uuid) on creation so the editor's
  // OrderedList / motion Reorder keying survives reorder + delete; it is
  // persisted, so the schema must tolerate it.
  id: z.string().optional(),
  variable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'validatedAttribute',
  }),
  prompt: z.string().min(1),
  hint: z.string().optional(),
  showValidationHints: z.boolean().optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

/**
 * One form may not write the same variable twice — the rule
 * `ComposerFormSchema` already applies to NetworkComposer forms, hoisted here
 * so every surface holding an array of `FormFieldSchema` shares it instead of
 * each call site remembering to add its own copy.
 *
 * Every field renders under its variable's name (the interview's
 * `useProtocolForm` passes `name: field.variable` to each Field, and the form
 * store keys its records by that name), so two fields for one variable collide
 * on a single form value while each still contributes its own initial value,
 * component and validation — the later registration silently replaces the
 * earlier's. Two fields writing one attribute is incoherent authoring whatever
 * the parameters, so reject the second occurrence outright.
 *
 * The scope is ONE form: separate forms resolve their references against
 * different subjects and are checked independently.
 */
export const uniqueFormFieldVariables = (
  fields: readonly { variable: string }[],
  ctx: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (seen.has(field.variable)) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Form fields contain duplicate variable "${field.variable}"`,
        path: [index, 'variable'],
      });
      continue;
    }
    seen.add(field.variable);
  }
};

/**
 * A bare array of form fields carrying the uniqueness rule — for the surfaces
 * that hold fields without the surrounding `FormSchema` object (FamilyPedigree's
 * `nodeConfig.form`).
 */
export const FormFieldArraySchema = z
  .array(FormFieldSchema)
  .superRefine(uniqueFormFieldVariables);

export const FormSchema = z.strictObject({
  title: z.string().min(1),
  fields: z.array(FormFieldSchema).min(1).superRefine(uniqueFormFieldVariables),
});

export type Form = z.infer<typeof FormSchema>;

// EgoForm/AlterForm/AlterEdgeForm never render form.title, so those stages use
// this title-less variant to keep authored protocols honest.
export const TitlelessFormSchema = z.strictObject({
  fields: z.array(FormFieldSchema).min(1).superRefine(uniqueFormFieldVariables),
});

export type TitlelessForm = z.infer<typeof TitlelessFormSchema>;
