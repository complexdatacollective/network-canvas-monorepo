import { randomItem, z } from "src/utils/zod-mock-extension";

const properties = ["first_name", "last_name", "age", "dob", "freq"] as const;
const directions = ["asc", "desc"] as const;

export const SortOrderSchema = z
	.array(
		z
			.object({
				property: z.string(),
				direction: z.enum(["asc", "desc"]),
			})
			.generateMock(() => ({
				property: randomItem(properties),
				direction: randomItem(directions),
			})),
	)
	.min(2)
	.max(4);

export type SortOrder = z.infer<typeof SortOrderSchema>;
