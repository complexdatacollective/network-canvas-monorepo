import { faker } from "@faker-js/faker";
import { z } from "~/utils/zod-mock-extension";
import { getAssetId, getNodeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { FormSchema, nameGeneratorPromptSchema, panelSchema } from "../common";
import { SortOrderSchema } from "../filters";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => getNodeTypeId()),
	})
	.strict();

export const nameGeneratorStage = baseStageSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		type: "NameGenerator",
		behaviours: {
			minNodes: 1,
			maxNodes: faker.number.int({ min: 2, max: 25 }),
		},
	}));

export const nameGeneratorQuickAddStage = baseStageSchema
	.extend({
		type: z.literal("NameGeneratorQuickAdd"),
		quickAdd: z.string().generateMock(() => getNodeVariableId(0)),
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
	})
	.generateMock((base) => ({
		...base,
		type: "NameGeneratorQuickAdd",
		behaviours: {
			minNodes: 1,
			maxNodes: faker.number.int({ min: 2, max: 25 }),
		},
	}));

export const nameGeneratorRosterStage = baseStageSchema.extend({
	type: z.literal("NameGeneratorRoster"),
	subject: NodeStageSubjectSchema,
	dataSource: z.string().generateMock(() => getAssetId()),
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
			fuzziness: z.number().generateMock(() => faker.number.float({ multipleOf: 0.25, min: 0, max: 1 })),
			matchProperties: z.array(z.string()).generateMock(() => [
				...faker.helpers.arrayElement([
					["name", "first_name", "last_name"],
					["website", "country", "name"],
					["email", "name"],
				]),
			]),
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
