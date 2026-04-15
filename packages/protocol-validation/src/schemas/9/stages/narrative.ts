import { faker } from "@faker-js/faker";
import { getEdgeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { NodeStageSubjectSchema } from "../../8/common";
import { FilterSchema } from "../../8/filters";
import { baseStageEntitySchema } from "./base";

export const narrativeStageEntity = baseStageEntitySchema.extend({
	stageType: z.literal("Narrative"),
	filter: FilterSchema.optional(),
	subject: NodeStageSubjectSchema,
	presets: z
		.array(
			z.strictObject({
				id: z.string(),
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
				layoutVariable: z.string().generateMock(() => getNodeVariableId(0)),
				groupVariable: z
					.string()
					.optional()
					.generateMock(() => getNodeVariableId(1)),
				edges: z
					.strictObject({
						display: z
							.array(z.string())
							.optional()
							.generateMock(() => [getEdgeTypeId(0), getEdgeTypeId(1)]),
					})
					.optional(),
				highlight: z
					.array(z.string())
					.optional()
					.generateMock(() => [getNodeVariableId(0), getNodeVariableId(1)]),
			}),
		)
		.min(1)
		.superRefine((prompts, ctx) => {
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
		.strictObject({
			concentricCircles: z
				.number()
				.int()
				.optional()
				.generateMock(() => faker.number.int({ min: 1, max: 5 })),
			skewedTowardCenter: z.boolean().optional(),
		})
		.optional(),
	behaviours: z
		.strictObject({
			freeDraw: z.boolean().optional(),
			allowRepositioning: z.boolean().optional(),
		})
		.optional(),
});
