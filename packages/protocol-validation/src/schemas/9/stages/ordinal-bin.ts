import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema, ordinalBinPromptSchema } from "../../8/common";
import { FilterSchema } from "../../8/filters";
import { baseStageEntitySchema } from "./base";

export const ordinalBinStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("OrdinalBin"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		prompts: z
			.array(ordinalBinPromptSchema)
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
		stageType: "OrdinalBin",
		prompts: [
			{
				id: crypto.randomUUID(),
				variable: getNodeVariableId(),
				text: faker.helpers.arrayElement([
					"When was the last time that you communicated with each of the people you named?",
					"How often do you see each person?",
					"Rank these people by how close you feel to them",
					"Order these people by how long you have known them",
				]),
				color: faker.helpers.arrayElement(["ord-color-seq-1", "ord-color-seq-2", "ord-color-seq-3"]),
			},
		],
	}));
