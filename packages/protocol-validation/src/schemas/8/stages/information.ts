import { faker } from "@faker-js/faker";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { baseStageSchema } from "./base";

// TODO: Should be narrowed based on type
const ItemSchema = z.strictObject({
	id: z.string(),
	type: z.enum(["text", "asset"]),
	content: z
		.string()
		.generateMock(() =>
			faker.helpers.arrayElement([
				"Welcome to our research study.",
				"On the next screen, you will be asked to provide some information.",
				"Please read through this information.",
			]),
		),
	description: z.string().optional(),
	size: z
		.string()
		.optional()
		.generateMock(() => faker.helpers.arrayElement(["SMALL", "MEDIUM", "LARGE"])),
	loop: z.boolean().optional(),
});

export type Item = z.infer<typeof ItemSchema>;

export const informationStage = baseStageSchema.extend({
	type: z.literal("Information"),
	title: z
		.string()
		.optional()
		.generateMock(() =>
			faker.helpers.arrayElement([
				"Welcome to the Study",
				"Information Interface",
				"Using the Sociogram",
				"Name Generation Techniques",
				"Skip Logic and Network Filtering",
			]),
		),
	items: z.array(ItemSchema).superRefine((items, ctx) => {
		// Check for duplicate item IDs
		const duplicateItemId = findDuplicateId(items);
		if (duplicateItemId) {
			ctx.addIssue({
				code: "custom" as const,
				message: `Items contain duplicate ID "${duplicateItemId}"`,
				path: [],
			});
		}
	}),
});
