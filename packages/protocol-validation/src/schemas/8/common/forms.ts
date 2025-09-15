import { getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";

const FormFieldSchema = z
	.object({ variable: z.string().generateMock(() => getNodeVariableId(0)), prompt: z.string() })
	.strict();

export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = z
	.object({
		title: z.string().optional(),
		fields: z.array(FormFieldSchema),
	})
	.strict();

export type Form = z.infer<typeof FormSchema>;
