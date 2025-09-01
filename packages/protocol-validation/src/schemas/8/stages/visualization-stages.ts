import { z } from "zod";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { sociogramPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
	})
	.strict();

export const sociogramStage = baseStageSchema.extend({
	type: z.literal("Sociogram"),
	subject: NodeStageSubjectSchema,
	background: z
		.object({
			image: z.string().optional(),
			concentricCircles: z.number().int().optional(),
			skewedTowardCenter: z.boolean().optional(),
		})
		.strict()
		.optional(),
	behaviours: z
		.object({
			automaticLayout: z.object({ enabled: z.boolean() }).strict().optional(),
		})
		.catchall(z.any())
		.optional(),
	prompts: z
		.array(sociogramPromptSchema)
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

export const narrativeStage = baseStageSchema.extend({
	type: z.literal("Narrative"),
	subject: NodeStageSubjectSchema,
	presets: z
		.array(
			z
				.object({
					id: z.string(),
					label: z.string(),
					layoutVariable: z.string(),
					groupVariable: z.string().optional(),
					edges: z
						.object({
							display: z.array(z.string()).optional(),
						})
						.strict()
						.optional(),
					highlight: z.array(z.string()).optional(),
				})
				.strict(),
		)
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
	background: z
		.object({
			concentricCircles: z.number().int().optional(),
			skewedTowardCenter: z.boolean().optional(),
		})
		.strict()
		.optional(),
	behaviours: z
		.object({
			freeDraw: z.boolean().optional(),
			allowRepositioning: z.boolean().optional(),
		})
		.strict()
		.optional(),
});
