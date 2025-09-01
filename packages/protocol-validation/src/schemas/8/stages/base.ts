import { z } from "zod";
import { FilterSchema } from "../filters";
import { SkipLogicSchema } from "../common";

export const baseStageSchema = z.object({
	id: z.string(),
	interviewScript: z.string().optional(),
	label: z.string(),
	filter: FilterSchema.optional(),
	skipLogic: SkipLogicSchema.optional(),
	introductionPanel: z.object({ title: z.string(), text: z.string() }).strict().optional(),
});
