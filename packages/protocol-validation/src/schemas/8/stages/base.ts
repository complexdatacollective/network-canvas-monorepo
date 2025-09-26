import { z } from "zod";
import { SkipLogicSchema } from "../common";

export const baseStageSchema = z.object({
	id: z.string(),
	interviewScript: z.string().optional(),
	label: z.string(),
	skipLogic: SkipLogicSchema.optional(),
	introductionPanel: z
		.object({
			title: z.string(),
			text: z.string(),
		})
		.strict()
		.optional(),
});
