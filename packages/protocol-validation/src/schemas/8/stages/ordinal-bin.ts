import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema, ordinalBinPromptSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const ordinalBinStage = baseStageSchema
	.extend({
		type: z.literal("OrdinalBin"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		prompts: z
			.array(ordinalBinPromptSchema)
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
		type: "OrdinalBin",
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
