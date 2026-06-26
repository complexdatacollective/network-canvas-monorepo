import { getNodeVariableId } from '~/utils/mock-seeds';
import { z } from '~/utils/zod-mock-extension';

import {
  asEntityAttributeReference,
  entityAttributeReference,
} from '../entity-attribute-reference';

export const FormFieldSchema = z.strictObject({
  variable: entityAttributeReference({ subject: 'stageSubject' }).generateMock(
    () => asEntityAttributeReference(getNodeVariableId(0)),
  ),
  prompt: z.string(),
  hint: z.string().optional(),
  showValidationHints: z.boolean().optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = z.strictObject({
  title: z.string().optional(),
  fields: z.array(FormFieldSchema).min(1),
});

export type Form = z.infer<typeof FormSchema>;

// EgoForm/AlterForm/AlterEdgeForm never render form.title, so those stages use
// this title-less variant to keep authored protocols honest.
export const TitlelessFormSchema = z.strictObject({
  fields: z.array(FormFieldSchema).min(1),
});

export type TitlelessForm = z.infer<typeof TitlelessFormSchema>;
