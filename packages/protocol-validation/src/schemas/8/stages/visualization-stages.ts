import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { sociogramPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => crypto.randomUUID()),
	})
	.strict();

export const sociogramStage = baseStageSchema
	.extend({
		type: z.literal("Sociogram"),
		subject: NodeStageSubjectSchema,
		background: z
			.object({
				image: z
					.string()
					.optional()
					.generateMock(() => crypto.randomUUID()),
				concentricCircles: z
					.number()
					.int()
					.optional()
					.generateMock(() => faker.number.int(4)),
				skewedTowardCenter: z.boolean().optional().generateMock(),
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
	})
	.generateMock((base) => ({
		...base,
		type: "Sociogram",
		background: {
			concentricCircles: 3,
			skewedTowardCenter: true,
		},
		prompts: [
			{
				id: crypto.randomUUID(),
				layout: {
					layoutVariable: crypto.randomUUID(),
				},
				highlight: {
					allowHighlighting: false,
				},
				text: "",
			},
		],
	}));

export const narrativeStage = baseStageSchema
	.extend({
		type: z.literal("Narrative"),
		subject: NodeStageSubjectSchema,
		presets: z
			.array(
				z
					.object({
						id: z.string().generateMock(() => crypto.randomUUID()),
						label: z
							.string()
							.generateMock(() =>
								faker.helpers.arrayElement([
									"Sample Preset",
									"Network Overview",
									"Group Visualization",
									"Relationship Display",
								]),
							),
						layoutVariable: z.string().generateMock(() => crypto.randomUUID()),
						groupVariable: z
							.string()
							.optional()
							.generateMock(() => crypto.randomUUID()),
						edges: z
							.object({
								display: z
									.array(z.string())
									.optional()
									.generateMock(() => [crypto.randomUUID(), crypto.randomUUID()]),
							})
							.strict()
							.optional(),
						highlight: z
							.array(z.string())
							.optional()
							.generateMock(() => [crypto.randomUUID(), crypto.randomUUID()]),
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
				concentricCircles: z
					.number()
					.int()
					.optional()
					.generateMock(() => faker.number.int(4)),
				skewedTowardCenter: z.boolean().optional(),
			})
			.strict()
			.optional(),
		behaviours: z
			.object({
				freeDraw: z
					.boolean()
					.optional()
					.generateMock(() => true),
				allowRepositioning: z
					.boolean()
					.optional()
					.generateMock(() => true),
			})
			.strict()
			.optional(),
	})
	.generateMock((base) => ({
		...base,
		type: "Narrative",
		background: {
			concentricCircles: 1,
		},
		behaviours: {
			allowRepositioning: true,
			freeDraw: true,
		},
		presets: [
			{
				id: crypto.randomUUID(),
				label: "Sample Preset",
				layoutVariable: crypto.randomUUID(),
				groupVariable: crypto.randomUUID(),
				edges: {
					display: [crypto.randomUUID(), crypto.randomUUID()],
				},
				highlight: [crypto.randomUUID(), crypto.randomUUID()],
			},
		],
	}));
