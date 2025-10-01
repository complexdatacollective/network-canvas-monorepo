import { faker } from "@faker-js/faker";
import { getEdgeTypeId, getEdgeVariableId, getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import {
	dyadCensusPromptSchema,
	EdgeStageSubjectSchema,
	FormSchema,
	NodeStageSubjectSchema,
	oneToManyDyadCensusPromptSchema,
	tieStrengthCensusPromptSchema,
} from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const dyadCensusStage = baseStageSchema
	.extend({
		type: z.literal("DyadCensus"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
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
				createEdge: getEdgeTypeId(),
			},
		],
	}));

export const tieStrengthCensusStage = baseStageSchema
	.extend({
		type: z.literal("TieStrengthCensus"),
		subject: NodeStageSubjectSchema,
		filter: FilterSchema.optional(),
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
				createEdge: getEdgeTypeId(),
				edgeVariable: getEdgeVariableId(),
				negativeLabel: faker.helpers.arrayElement(["Weak", "Not close", "Distant"]),
			},
		],
	}));

export const oneToManyDyadCensusStage = baseStageSchema
	.extend({
		type: z.literal("OneToManyDyadCensus"),
		filter: FilterSchema.optional(),
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
				createEdge: getEdgeTypeId(),
			},
		],
	}));

export const familyTreeCensusStage = baseStageSchema
	.extend({
		type: z.literal("FamilyTreeCensus"),
		// The node type that is created when nodes are added
		subject: NodeStageSubjectSchema,
		// The edge type created when any kind of family relationship exists
		edgeType: EdgeStageSubjectSchema,
		// Variable on edgeType used to store the type of family relationship
		relationshipTypeVariable: z.string().generateMock(() => getEdgeVariableId(0)),
		// Biological sex variable present on node type. Optional, as this may not be collected.
		sexVariable: z
			.string()
			.optional()
			.generateMock(() => getNodeVariableId(1)),
		step1: z.object({
			text: z.string().generateMock(() => "how many family members"),
		}),
		step2: z.object({
			text: z.string().generateMock(() => "enter family members"),
			form: FormSchema,
		}),
		step3: z
			.object({
				text: z.string().generateMock(() => "nominate diseases"),
				attributes: z.array(
					z.object({
						id: z.string(),
						label: z.string(),
						variable: z.string().generateMock(() => getNodeVariableId(0)),
					}),
				),
			})
			.optional(),
	})
	.generateMock((base) => ({
		...base,
	}));
