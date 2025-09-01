import { z } from "zod";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { dyadCensusPromptSchema, oneToManyDyadCensusPromptSchema, tieStrengthCensusPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
	})
	.strict();

export const dyadCensusStage = baseStageSchema.extend({
	type: z.literal("DyadCensus"),
	subject: NodeStageSubjectSchema,
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
});

export const tieStrengthCensusStage = baseStageSchema.extend({
	type: z.literal("TieStrengthCensus"),
	subject: NodeStageSubjectSchema,
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
});

export const oneToManyDyadCensusStage = baseStageSchema.extend({
	type: z.literal("OneToManyDyadCensus"),
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
});

export const familyTreeCensusStage = baseStageSchema.extend({
	type: z.literal("FamilyTreeCensus"),
});
