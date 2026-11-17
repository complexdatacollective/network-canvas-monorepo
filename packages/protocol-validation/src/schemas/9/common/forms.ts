import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';

export const FormFieldSchema = z.strictObject({
  // A stable identity for the field, unlike its position or its variable, both
  // of which an edit can change. Architect assigns a uuid when it creates a
  // field, and the schema 8 to 9 migration assigns one to every field it
  // upgrades. Anything that tracks a field across copies of a protocol (the
  // editor's reordering, the protocol review) relies on every field having
  // one, so it is required. It is unique within its form
  // (`uniqueFormFieldIds`).
  id: z.string().min(1),
  variable: entityAttributeReference({
    subject: 'stageSubject',
    usage: 'validatedAttribute',
  }),
  // The text captioning the field. Every translation must say something: the
  // interview has no other caption to show, because the codebook variable's
  // own label is plain text that is never translated.
  prompt: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'single' },
    {
      dynamicValues: 'formField',
    },
  ),
  hint: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'single' },
    {
      dynamicValues: 'formField',
    },
  ).optional(),
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
 * One form may not give two fields the same id: an id exists to tell the
 * fields of a form apart across copies, so a repeat defeats it. The second
 * occurrence is the one rejected, as for a repeated variable; the scope is
 * ONE form.
 */
const uniqueFormFieldIds = (
  fields: readonly { id: string }[],
  ctx: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    if (seen.has(field.id)) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Form fields contain duplicate id "${field.id}"`,
        path: [index, 'id'],
      });
      return;
    }
    seen.add(field.id);
  });
};

const uniqueFormFields = (
  fields: readonly { id: string; variable: string }[],
  ctx: z.RefinementCtx,
): void => {
  uniqueFormFieldVariables(fields, ctx);
  uniqueFormFieldIds(fields, ctx);
};

/**
 * A bare array of form fields carrying the uniqueness rules — for the surfaces
 * that hold fields without the surrounding `FormSchema` object.
 */
export const FormFieldArraySchema = z
  .array(FormFieldSchema)
  .superRefine(uniqueFormFields);

export const FormSchema = z.strictObject({
  title: localizedString(
    nonBlankText(),
    { format: 'plain', lines: 'single' },
    {
      dynamicValues: 'stageText',
    },
  ),
  fields: z.array(FormFieldSchema).min(1).superRefine(uniqueFormFields),
});

export type Form = z.infer<typeof FormSchema>;

// EgoForm/AlterForm/AlterEdgeForm never render form.title, so those stages use
// this title-less variant to keep authored protocols honest.
export const TitlelessFormSchema = z.strictObject({
  fields: z.array(FormFieldSchema).min(1).superRefine(uniqueFormFields),
});

export type TitlelessForm = z.infer<typeof TitlelessFormSchema>;
