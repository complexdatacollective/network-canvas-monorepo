import { faker } from "@faker-js/faker";
import { getEdgeTypeId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema, oneToManyDyadCensusPromptSchema } from "../../8/common";
import { FilterSchema } from "../../8/filters";
import { baseStageEntitySchema } from "./base";

export const oneToManyDyadCensusStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("OneToManyDyadCensus"),
		filter: FilterSchema.optional(),
		subject: NodeStageSubjectSchema,
		behaviours: z.object({
			removeAfterConsideration: z.boolean(),
		}),
		prompts: z
			.array(oneToManyDyadCensusPromptSchema)
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
	})
	.generateMock((base) => ({
		...base,
		stageType: "OneToManyDyadCensus",
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
