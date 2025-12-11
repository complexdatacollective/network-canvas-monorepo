import { faker } from "@faker-js/faker";
import { getEdgeTypeId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { dyadCensusPromptSchema, IntroductionPanelSchema, NodeStageSubjectSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const dyadCensusStage = baseStageSchema
	.extend({
		type: z.literal("DyadCensus"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		prompts: z
			.array(dyadCensusPromptSchema)
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
		introductionPanel: IntroductionPanelSchema,
	})
	.generateMock((base) => ({
		...base,
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"Do these two people spend time together outside of class?",
					"Do these two people know each other?",
					"Have these two people met before?",
					"Are these two people friends?",
				]),
				createEdge: getEdgeTypeId(),
			},
		],
	}));
