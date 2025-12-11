import { faker } from "@faker-js/faker";
import { getEdgeTypeId, getEdgeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { IntroductionPanelSchema, NodeStageSubjectSchema, tieStrengthCensusPromptSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const tieStrengthCensusStage = baseStageSchema
	.extend({
		type: z.literal("TieStrengthCensus"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		prompts: z
			.array(tieStrengthCensusPromptSchema)
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
