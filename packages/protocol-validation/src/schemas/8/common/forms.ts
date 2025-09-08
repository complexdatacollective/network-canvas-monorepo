import { z } from "src/utils/zod-mock-extension";
import { randomVariable } from "../../../utils/mock-ids";

const FormFieldSchema = z
	.object({ variable: z.string().generateMock(() => randomVariable()), prompt: z.string() })
	.strict();

export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = z
	.object({
		title: z.string().optional(),
		fields: z.array(FormFieldSchema),
	})
	.strict();

export type Form = z.infer<typeof FormSchema>;
