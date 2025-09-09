import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { randomVariable } from "../../../utils/mock-ids";

const directions = ["asc", "desc"] as const;

export const SortOrderSchema = z.array(
	z
		.object({
			property: z.string(),
			direction: z.enum(["asc", "desc"]),
		})
		.generateMock(() => ({
			property: randomVariable(),
			direction: faker.helpers.arrayElement(directions),
		})),
);

export type SortOrder = z.infer<typeof SortOrderSchema>;
