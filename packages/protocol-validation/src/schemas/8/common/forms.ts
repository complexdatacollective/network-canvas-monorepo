import { getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";

export const FormFieldSchema = z.strictObject({
	variable: z.string().generateMock(() => getNodeVariableId(0)),
	prompt: z.string(),
	hint: z.string().optional(),
	showValidationHints: z.boolean().optional(),
});

export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = z.strictObject({
	title: z.string().optional(),
	fields: z.array(FormFieldSchema),
});

export type Form = z.infer<typeof FormSchema>;
