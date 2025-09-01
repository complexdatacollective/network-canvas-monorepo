import { z } from "zod";

export const SortOrderSchema = z.array(
	z.object({
		property: z.string(),
		direction: z.enum(["desc", "asc"]),
	}),
);

export type SortOrder = z.infer<typeof SortOrderSchema>;
