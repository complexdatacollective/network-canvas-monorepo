import { z } from "zod";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { categoricalBinPromptSchema, ordinalBinPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
	})
	.strict();

export const ordinalBinStage = baseStageSchema.extend({
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
});

export const categoricalBinStage = baseStageSchema.extend({
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
});
