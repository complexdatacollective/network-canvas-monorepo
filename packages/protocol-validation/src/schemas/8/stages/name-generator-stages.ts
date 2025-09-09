import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { FormSchema, nameGeneratorPromptSchema, panelSchema } from "../common";
import { SortOrderSchema } from "../filters";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => crypto.randomUUID()),
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
			maxNodes: faker.helpers.arrayElement([10, 15, 20, 25]),
		},
	}));

export const nameGeneratorQuickAddStage = baseStageSchema
	.extend({
		type: z.literal("NameGeneratorQuickAdd"),
		quickAdd: z.string().generateMock(() => crypto.randomUUID()),
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
			maxNodes: faker.helpers.arrayElement([5, 10, 15]),
		},
	}));

export const nameGeneratorRosterStage = baseStageSchema
	.extend({
		type: z.literal("NameGeneratorRoster"),
		subject: NodeStageSubjectSchema,
		dataSource: z.string().generateMock(() => crypto.randomUUID()),
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
				fuzziness: z.number().generateMock(() => faker.helpers.arrayElement([0.25, 0.5, 0.75])),
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
	})
	.generateMock((base) => ({
		...base,
		type: "NameGeneratorRoster",
		cardOptions: {
			additionalProperties: [
				{ label: "First Name", variable: "first_name" },
				{ label: "Last Name", variable: "last_name" },
			],
		},
		sortOptions: {
			sortOrder: [{ property: "first_name", direction: "asc" }],
			sortableProperties: [
				{ label: "First Name", variable: "first_name" },
				{ label: "Last Name", variable: "last_name" },
			],
		},
		behaviours: {
			minNodes: 1,
			maxNodes: faker.helpers.arrayElement([20, 30, 50]),
		},
	}));
