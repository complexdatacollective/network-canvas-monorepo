import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { dyadCensusPromptSchema, oneToManyDyadCensusPromptSchema, tieStrengthCensusPromptSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => crypto.randomUUID()),
	})
	.strict();

export const dyadCensusStage = baseStageSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		type: "DyadCensus",
		introductionPanel: {
			title: "Dyad Census",
			text: "In the next screens, you will be shown pairs of alters. By answering 'Yes' to the questions, an edge between both alters will then be created.",
		},
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"Do these two people spend time together outside of class?",
					"Do these two people know each other?",
					"Have these two people met before?",
					"Are these two people friends?",
				]),
				createEdge: crypto.randomUUID(),
			},
		],
	}));

export const tieStrengthCensusStage = baseStageSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		type: "TieStrengthCensus",
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"How much do these two people know each other?",
					"Rate the relationship strength between these two people",
					"How close would you say these two people are?",
				]),
				createEdge: crypto.randomUUID(),
				edgeVariable: crypto.randomUUID(),
				negativeLabel: faker.helpers.arrayElement(["Weak", "Not close", "Distant"]),
			},
		],
	}));

export const oneToManyDyadCensusStage = baseStageSchema
	.extend({
		type: z.literal("OneToManyDyadCensus"),
		subject: NodeStageSubjectSchema,
		behaviours: z.object({
			removeAfterConsideration: z.boolean().generateMock(() => faker.helpers.arrayElement([true, false])),
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
	})
	.generateMock((base) => ({
		...base,
		type: "OneToManyDyadCensus",
		behaviours: {
			removeAfterConsideration: false,
		},
		prompts: [
			{
				id: crypto.randomUUID(),
				text: faker.helpers.arrayElement([
					"Which of these people does this person know?",
					"Who does this person have a relationship with?",
					"Select all people that this person is connected to",
				]),
				createEdge: crypto.randomUUID(),
			},
		],
	}));

export const familyTreeCensusStage = baseStageSchema
	.extend({
		type: z.literal("FamilyTreeCensus"),
	})
	.generateMock((base) => ({
		...base,
		type: "FamilyTreeCensus",
	}));
