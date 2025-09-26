import { faker } from "@faker-js/faker";
import { getAssetId, getEdgeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema, sociogramPromptSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const sociogramStage = baseStageSchema
	.extend({
		type: z.literal("Sociogram"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		background: z
			.object({
				image: z
					.string()
					.optional()
					.generateMock(() => getAssetId()),
				concentricCircles: z
					.number()
					.int()
					.optional()
					.generateMock(() => faker.number.int({ min: 1, max: 5 })),
				skewedTowardCenter: z.boolean().optional(),
			})
			.strict()
			.optional(),
		behaviours: z
			.object({
				automaticLayout: z.object({ enabled: z.boolean() }).strict().optional(),
			})
			.catchall(z.any())
			.optional(),
		prompts: z
			.array(sociogramPromptSchema)
			.min(1)
			.superRefine((prompts, ctx) => {
				// Check for duplicate prompt IDs
				const duplicatePromptId = findDuplicateId(prompts);
				if (duplicatePromptId) {
					ctx.addIssue({
						code: "custom" as const,
						message: `Prompts contain duplicate ID "${duplicatePromptId}"`,
						path: [],
					});
				}
			}),
	})
	.generateMock((base) => ({
		...base,
		type: "Sociogram",
		background: {
			concentricCircles: 3,
			skewedTowardCenter: true,
		},
		prompts: [
			{
				id: crypto.randomUUID(),
				layout: {
					layoutVariable: getNodeVariableId(0),
				},
				highlight: {
					allowHighlighting: false,
				},
				text: "",
			},
		],
	}));

export const narrativeStage = baseStageSchema.extend({
	type: z.literal("Narrative"),
	filter: FilterSchema.optional(),
	subject: NodeStageSubjectSchema,
	presets: z
		.array(
			z
				.object({
					id: z.string(),
					label: z
						.string()
						.generateMock(() =>
							faker.helpers.arrayElement([
								"Sample Preset",
								"Network Overview",
								"Group Visualization",
								"Relationship Display",
							]),
						),
					layoutVariable: z.string().generateMock(() => getNodeVariableId(0)),
					groupVariable: z
						.string()
						.optional()
						.generateMock(() => getNodeVariableId(1)),
					edges: z
						.object({
							display: z
								.array(z.string())
								.optional()
								.generateMock(() => [getEdgeTypeId(0), getEdgeTypeId(1)]),
						})
						.strict()
						.optional(),
					highlight: z
						.array(z.string())
						.optional()
						.generateMock(() => [getNodeVariableId(0), getNodeVariableId(1)]),
				})
				.strict(),
		)
		.min(1)
		.superRefine((prompts, ctx) => {
			// Check for duplicate prompt IDs
			const duplicatePromptId = findDuplicateId(prompts);
			if (duplicatePromptId) {
				ctx.addIssue({
					code: "custom" as const,
					message: `Prompts contain duplicate ID "${duplicatePromptId}"`,
					path: [],
				});
			}
		}),
	background: z
		.object({
			concentricCircles: z
				.number()
				.int()
				.optional()
				.generateMock(() => faker.number.int({ min: 1, max: 5 })),
			skewedTowardCenter: z.boolean().optional(),
		})
		.strict()
		.optional(),
	behaviours: z
		.object({
			freeDraw: z.boolean().optional(),
			allowRepositioning: z.boolean().optional(),
		})
		.strict()
		.optional(),
});
