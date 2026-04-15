import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema, nameGeneratorPromptSchema, panelSchema } from "../../8/common";
import { baseStageEntitySchema } from "./base";

export const nameGeneratorQuickAddStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("NameGeneratorQuickAdd"),
		quickAdd: z.string().generateMock(() => getNodeVariableId(0)),
		subject: NodeStageSubjectSchema,
		panels: z
			.array(panelSchema)
			.optional()
			.superRefine((panels, ctx) => {
				if (panels) {
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
		stageType: "NameGeneratorQuickAdd",
		behaviours: {
			minNodes: 1,
			maxNodes: faker.number.int({ min: 2, max: 25 }),
		},
	}));
