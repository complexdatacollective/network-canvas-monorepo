import { z } from "~/utils/zod-mock-extension";
import { baseStageEntitySchema } from "./base";

export const finishInterviewStageEntity = baseStageEntitySchema
	.omit({ target: true })
	.extend({
		stageType: z.literal("FinishInterview"),
		message: z.string().optional(),
	})
	.strict();
