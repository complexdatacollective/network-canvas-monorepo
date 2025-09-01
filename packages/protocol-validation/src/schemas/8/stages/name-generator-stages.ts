import { z } from "zod";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { FormSchema, nameGeneratorPromptSchema, panelSchema } from "../common";
import { SortOrderSchema } from "../filters";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
	})
	.strict();

export const nameGeneratorStage = baseStageSchema.extend({
	type: z.literal("NameGenerator"),
	form: FormSchema,
	subject: NodeStageSubjectSchema,
	panels: z
		.array(panelSchema)
		.optional()
		.superRefine((panels, ctx) => {
			if (panels) {
				// Check for duplicate panel IDs
				const duplicatePanelId = findDuplicateId(panels);
				if (duplicatePanelId) {
					ctx.addIssue({
						code: "custom" as const,
						message: `Panels contain duplicate ID "${duplicatePanelId}"`,
						path: [],
					});
				}
			}
		}),
	prompts: z
		.array(nameGeneratorPromptSchema)
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
	behaviours: z
		.object({
			minNodes: z.number().int().optional(),
			maxNodes: z.number().int().optional(),
		})
		.optional(),
});

export const nameGeneratorQuickAddStage = baseStageSchema.extend({
	type: z.literal("NameGeneratorQuickAdd"),
	quickAdd: z.string(),
	subject: NodeStageSubjectSchema,
	panels: z
		.array(panelSchema)
		.optional()
		.superRefine((panels, ctx) => {
			if (panels) {
				// Check for duplicate panel IDs
				const duplicatePanelId = findDuplicateId(panels);
				if (duplicatePanelId) {
					ctx.addIssue({
						code: "custom" as const,
						message: `Panels contain duplicate ID "${duplicatePanelId}"`,
						path: [],
					});
				}
			}
		}),
	prompts: z
		.array(nameGeneratorPromptSchema)
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
	behaviours: z
		.object({
			minNodes: z.number().int().optional(),
			maxNodes: z.number().int().optional(),
		})
		.optional(),
});

export const nameGeneratorRosterStage = baseStageSchema.extend({
	type: z.literal("NameGeneratorRoster"),
	subject: NodeStageSubjectSchema,
	dataSource: z.string(),
	cardOptions: z
		.object({
			displayLabel: z.string().optional(),
			additionalProperties: z.array(z.object({ label: z.string(), variable: z.string() }).strict()).optional(),
		})
		.strict()
		.optional(),
	sortOptions: z
		.object({
			sortOrder: SortOrderSchema.optional(),
			sortableProperties: z.array(z.object({ label: z.string(), variable: z.string() }).strict()).optional(),
		})
		.optional(),
	searchOptions: z
		.object({
			fuzziness: z.number(),
			matchProperties: z.array(z.string()),
		})
		.strict()
		.optional(),
	prompts: z
		.array(nameGeneratorPromptSchema)
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
	behaviours: z
		.object({
			minNodes: z.number().int().optional(),
			maxNodes: z.number().int().optional(),
		})
		.optional(),
});
