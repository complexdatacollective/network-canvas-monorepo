import { randomItem, z } from "src/utils/zod-mock-extension";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { categoricalBinPromptSchema, ordinalBinPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => crypto.randomUUID()),
	})
	.strict();

export const ordinalBinStage = baseStageSchema
	.extend({
		type: z.literal("OrdinalBin"),
		subject: NodeStageSubjectSchema,
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
				variable: crypto.randomUUID(),
				text: randomItem([
					"When was the last time that you communicated with each of the people you named?",
					"How often do you see each person?",
					"Rank these people by how close you feel to them",
					"Order these people by how long you have known them",
				]),
				color: randomItem(["ord-color-seq-1", "ord-color-seq-2", "ord-color-seq-3"]),
			},
		],
	}));

export const categoricalBinStage = baseStageSchema
	.extend({
		type: z.literal("CategoricalBin"),
		subject: NodeStageSubjectSchema,
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
				variable: crypto.randomUUID(),
				text: randomItem([
					"Which of these options best describes how you know this person?",
					"What type of relationship do you have with each person?",
					"How would you categorize your relationship with each person?",
					"Which group does each person belong to?",
				]),
				otherOptionLabel: randomItem(["Other", "Something else", "Not listed"]),
				otherVariablePrompt: randomItem([
					"Which context best describes how you know this person?",
					"Please specify the relationship type",
					"How would you describe this relationship?",
				]),
				otherVariable: crypto.randomUUID(),
			},
		],
	}));
