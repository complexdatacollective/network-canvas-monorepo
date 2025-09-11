import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "../../../utils/mock-seeds";
import { z } from "../../../utils/zod-mock-extension";

const directions = ["asc", "desc"] as const;

export const SortOrderSchema = z.array(
	z
		.object({
			property: z.string(),
			direction: z.enum(["asc", "desc"]),
		})
		.generateMock(() => ({
			property: getNodeVariableId(),
			direction: faker.helpers.arrayElement(directions),
		})),
);

export type SortOrder = z.infer<typeof SortOrderSchema>;
