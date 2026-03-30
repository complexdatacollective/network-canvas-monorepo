import { z } from "~/utils/zod-mock-extension";

export const baseStageEntitySchema = z.object({
	id: z.string(),
	type: z.literal("Stage"),
	label: z.string(),
	interviewScript: z.string().optional(),
	target: z.string().optional(),
});
