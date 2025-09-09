import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { baseStageSchema } from "./base";

// TODO: Should be narrowed based on type
const ItemSchema = z
	.object({
		id: z.string().generateMock(() => crypto.randomUUID()),
		type: z.enum(["text", "asset"]),
		content: z.string().generateMock(() =>
			faker.helpers.arrayElement([
				"Welcome to our research study.",
				"On the next screen, you will be asked to provide some information.",
				"Please read through this information.",
				crypto.randomUUID(), // For asset content
			]),
		),
		description: z.string().optional(),
		size: z
			.string()
			.optional()
			.generateMock(() => faker.helpers.arrayElement(["SMALL", "MEDIUM", "LARGE"])),
		loop: z.boolean().optional(),
	})
	.strict();

export type Item = z.infer<typeof ItemSchema>;

export const informationStage = baseStageSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		type: "Information",
		title: faker.helpers.arrayElement([
			"Welcome to the Sample Protocol",
			"Information Interface",
			"Using the Sociogram",
			"Name Generation Using Roster Data",
			"Skip Logic and Network Filtering",
		]),
		items: [
			{
				id: crypto.randomUUID(),
				type: "text",
				content:
					"We developed this sample interview protocol to provide an overview of the features of Interviewer, and give examples of the key tasks associated with conducting a personal network interview.",
				size: "MEDIUM",
			},
			{
				id: crypto.randomUUID(),
				type: "text",
				content:
					"To move through this protocol, use the arrows on the left hand side of the screen. When you are ready to continue, click the down arrow.",
				size: "SMALL",
			},
			...(Math.random() > 0.5
				? [
						{
							id: crypto.randomUUID(),
							type: "asset" as const,
							content: crypto.randomUUID(),
							size: "SMALL",
						},
					]
				: []),
		],
	}));

export const anonymisationStage = baseStageSchema
	.extend({
		type: z.literal("Anonymisation"),
		explanationText: z
			.object({
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
			})
			.strict(),
		validation: z
			.object({
				minLength: z
					.number()
					.int()
					.optional()
					.generateMock(() => faker.number.int(8)),
				maxLength: z
					.number()
					.int()
					.optional()
					.generateMock(() => faker.number.int({ min: 8, max: 20 })),
			})
			.optional(),
	})
	.generateMock((base) => ({
		...base,
		type: "Anonymisation",
		explanationText: {
			title: "Create an Anonymous ID",
			body: "Please create a unique identifier that will be used to anonymize your data. This should be something memorable to you but not identifiable to others.",
		},
		validation: {
			minLength: 6,
			maxLength: 20,
		},
	}));
