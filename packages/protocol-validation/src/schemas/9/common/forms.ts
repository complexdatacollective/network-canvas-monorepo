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
 * The positions of form fields that REPEAT a variable an earlier field in the
 * same array already names — never the first occurrence, so array order alone
 * decides which field is the real one.
 *
 * Kept separate from the rule below, and taking `unknown` entries, so anything
 * that has to ask this question of unvalidated protocol data asks it in exactly
 * the terms the schema does — an answer that differed from the schema's would
 * either object to a form the schema accepts, or pass one it still rejects. A
 * field whose `variable` is not a string is never a duplicate; the schema
 * rejects it on its own terms.
 */
export const duplicateFormFieldIndices = (
  fields: readonly unknown[],
): number[] => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  fields.forEach((field, index) => {
    if (typeof field !== 'object' || field === null) return;
    const { variable } = field as { variable?: unknown };
    if (typeof variable !== 'string') return;
    if (seen.has(variable)) {
      duplicates.push(index);
      return;
    }
    seen.add(variable);
  });
  return duplicates;
};

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
  for (const index of duplicateFormFieldIndices(fields)) {
    ctx.addIssue({
      code: 'custom' as const,
      message: `Form fields contain duplicate attribute "${fields[index]?.variable}"`,
      path: [index, 'variable'],
    });
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
