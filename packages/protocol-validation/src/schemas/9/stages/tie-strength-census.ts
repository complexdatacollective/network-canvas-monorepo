import { faker } from "@faker-js/faker";
import { getEdgeTypeId, getEdgeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { IntroductionPanelSchema, NodeStageSubjectSchema, tieStrengthCensusPromptSchema } from "../../8/common";
import { FilterSchema } from "../../8/filters";
import { baseStageEntitySchema } from "./base";

export const tieStrengthCensusStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("TieStrengthCensus"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		prompts: z
			.array(tieStrengthCensusPromptSchema)
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
		introductionPanel: IntroductionPanelSchema,
	})
	.generateMock((base) => ({
		...base,
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"How much do these two people know each other?",
					"Rate the relationship strength between these two people",
					"How close would you say these two people are?",
				]),
				createEdge: getEdgeTypeId(),
				edgeVariable: getEdgeVariableId(),
				negativeLabel: faker.helpers.arrayElement(["Weak", "Not close", "Distant"]),
			},
		],
	}));
