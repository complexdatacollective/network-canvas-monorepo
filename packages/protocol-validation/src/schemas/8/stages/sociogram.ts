import { faker } from "@faker-js/faker";
import { getAssetId, getNodeVariableId } from "~/utils/mock-seeds";
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
			.strictObject({
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
			.optional(),
		behaviours: z
			.object({
				automaticLayout: z.strictObject({ enabled: z.boolean() }).optional(),
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
