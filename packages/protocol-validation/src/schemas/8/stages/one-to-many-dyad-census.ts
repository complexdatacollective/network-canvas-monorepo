import { faker } from "@faker-js/faker";
import { getEdgeTypeId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema, oneToManyDyadCensusPromptSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const oneToManyDyadCensusStage = baseStageSchema
	.extend({
		type: z.literal("OneToManyDyadCensus"),
		filter: FilterSchema.optional(),
		subject: NodeStageSubjectSchema,
		behaviours: z.object({
			removeAfterConsideration: z.boolean(),
		}),
		prompts: z
			.array(oneToManyDyadCensusPromptSchema)
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
		type: "OneToManyDyadCensus",
		behaviours: {
			removeAfterConsideration: false,
		},
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"Which of these people does this person know?",
					"Who does this person have a relationship with?",
					"Select all people that this person is connected to",
				]),
				createEdge: getEdgeTypeId(),
			},
		],
	}));
