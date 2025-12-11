import { faker } from "@faker-js/faker";
import { z } from "~/utils/zod-mock-extension";
import { baseStageSchema } from "./base";

export const anonymisationStage = baseStageSchema.extend({
	type: z.literal("Anonymisation"),
	explanationText: z.strictObject({
		title: z
			.string()
			.generateMock(() => faker.helpers.arrayElement(["Create an Anonymous ID", "Anonymous Identifier"])),
		body: z
			.string()
			.generateMock(() =>
				faker.helpers.arrayElement([
					"Please create a unique identifier that will be used to anonymize your data.",
					"To protect your privacy, please enter a unique code that only you will know.",
					"Create a personal identifier to keep your responses anonymous while allowing us to link your data.",
				]),
			),
	}),
	validation: z
		.object({
			minLength: z
				.number()
				.int()
				.optional()
				.generateMock(() => faker.number.int({ min: 2, max: 5 })),
			maxLength: z
				.number()
				.int()
				.optional()
				.generateMock(() => faker.number.int({ min: 6, max: 20 })),
		})
		.optional(),
});
