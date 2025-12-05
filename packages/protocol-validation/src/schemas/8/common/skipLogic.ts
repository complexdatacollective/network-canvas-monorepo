import { z } from "~/utils/zod-mock-extension";
import { FilterSchema } from "../filters";

const SkipLogicActionSchema = z.enum(["SHOW", "SKIP"]);
export type SkipLogicAction = z.infer<typeof SkipLogicActionSchema>;

export const SkipLogicSchema = z.strictObject({
	action: SkipLogicActionSchema,
	filter: FilterSchema,
});

export type SkipLogic = z.infer<typeof SkipLogicSchema>;
