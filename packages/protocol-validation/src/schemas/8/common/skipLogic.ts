import { z } from "~/utils/zod-mock-extension";
import { FilterSchema } from "../filters";

const SkipLogicActionSchema = z.enum(["SHOW", "SKIP"]);
export type SkipLogicAction = z.infer<typeof SkipLogicActionSchema>;

export const SkipLogicSchema = z
	.object({
		action: SkipLogicActionSchema,
		filter: FilterSchema,
	})
	.strict();

export type SkipLogic = z.infer<typeof SkipLogicSchema>;
