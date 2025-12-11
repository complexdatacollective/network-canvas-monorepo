import { faker } from "@faker-js/faker";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { FormSchema, NodeStageSubjectSchema, nameGeneratorPromptSchema, panelSchema } from "../common";
import { baseStageSchema } from "./base";

export const nameGeneratorStage = baseStageSchema
	.extend({
		type: z.literal("NameGenerator"),
		form: FormSchema,
		subject: NodeStageSubjectSchema,
		panels: z
			.array(panelSchema)
			.optional()
			.superRefine((panels, ctx) => {
				if (panels) {
					// Check for duplicate panel IDs
					const duplicatePanelId = findDuplicateId(panels);
					if (duplicatePanelId) {
						ctx.addIssue({
							code: "custom" as const,
							message: `Panels contain duplicate ID "${duplicatePanelId}"`,
							path: [],
						});
					}
				}
			}),
		prompts: z
			.array(nameGeneratorPromptSchema)
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
		behaviours: z
			.object({
				minNodes: z.number().int().optional(),
				maxNodes: z.number().int().optional(),
			})
			.optional(),
	})
	.generateMock((base) => ({
		...base,
		type: "NameGenerator",
		behaviours: {
			minNodes: 1,
			maxNodes: faker.number.int({ min: 2, max: 25 }),
		},
	}));
