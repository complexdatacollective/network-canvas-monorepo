import { z } from "src/utils/zod-mock-extension";
import { FilterSchema } from "../filters";

export const panelSchema = z.object({
	id: z.string(),
	title: z.string(),
	filter: FilterSchema.optional(),
	dataSource: z.union([z.string(), z.literal("existing")]),
});

export type Panel = z.infer<typeof panelSchema>;
