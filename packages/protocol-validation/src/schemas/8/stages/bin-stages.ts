import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { categoricalBinPromptSchema, NodeStageSubjectSchema, ordinalBinPromptSchema } from "../common";
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

export const categoricalBinStage = baseStageSchema
	.extend({
		type: z.literal("CategoricalBin"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
		prompts: z
			.array(categoricalBinPromptSchema)
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
		type: "CategoricalBin",
		prompts: [
			{
				id: crypto.randomUUID(),
				variable: getNodeVariableId(),
				text: faker.helpers.arrayElement([
					"Which of these options best describes how you know this person?",
					"What type of relationship do you have with each person?",
					"How would you categorize your relationship with each person?",
					"Which group does each person belong to?",
				]),
				otherOptionLabel: faker.helpers.arrayElement(["Other", "Something else", "Not listed"]),
				otherVariablePrompt: faker.helpers.arrayElement([
					"Which context best describes how you know this person?",
					"Please specify the relationship type",
					"How would you describe this relationship?",
				]),
				otherVariable: getNodeVariableId(1),
			},
		],
	}));
