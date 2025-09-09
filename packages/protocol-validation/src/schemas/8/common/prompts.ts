import { VariableNameSchema } from "@codaco/shared-consts";
import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { randomEdgeType, randomVariable } from "../../../utils/mock-ids";
import { SortOrderSchema } from "../filters";

const promptSchema = z
	.object({
		id: z.string().generateMock(() => crypto.randomUUID()),
		text: z.string(),
	})
	.strict();

export type BasePrompt = z.infer<typeof promptSchema>;

const AdditionalAttributesSchema = z.array(z.object({ variable: VariableNameSchema, value: z.boolean() }));

export type AdditionalAttributes = z.infer<typeof AdditionalAttributesSchema>;

export const nameGeneratorPromptSchema = promptSchema.extend({
	additionalAttributes: AdditionalAttributesSchema.optional(),
});

export const sociogramPromptSchema = promptSchema.extend({
	sortOrder: SortOrderSchema.optional(),
	layout: z.object({
		layoutVariable: z.string().generateMock(() => randomVariable()),
	}),
	edges: z
		.object({
			display: z.array(z.string()).optional(),
			create: z.string().optional(),
		})
		.optional(),
	highlight: z
		.object({
			allowHighlighting: z.boolean().optional(),
			variable: z.string().optional(),
		})
		.optional(),
});

export const dyadCensusPromptSchema = promptSchema.extend({
	createEdge: z.string().generateMock(() => randomEdgeType()),
});

export const tieStrengthCensusPromptSchema = promptSchema.extend({
	createEdge: z.string().generateMock(() => randomEdgeType()),
	edgeVariable: z.string().generateMock(() => randomVariable()),
	negativeLabel: z
		.string()
		.generateMock(() =>
			faker.helpers.arrayElement(["not_knows", "not_works_with", "not_friends_with", "not_related_to"]),
		),
});

export const ordinalBinPromptSchema = promptSchema.extend({
	variable: z.string().generateMock(() => randomVariable()),
	bucketSortOrder: SortOrderSchema.optional(),
	binSortOrder: SortOrderSchema.optional(),
	color: z.string().optional(),
});

export const categoricalBinPromptSchema = promptSchema.extend({
	variable: z.string().generateMock(() => randomVariable()),
	// TODO: This should be structured this way:
	// otherOption: z.object({
	// 	binLabel: z.string(),
	// 	variable: z.string(),
	// 	prompt: z.string(),
	// }).optional(),
	otherVariable: z
		.string()
		.generateMock(() => randomVariable())
		.optional(),
	otherVariablePrompt: z.string().optional(),
	otherOptionLabel: z.string().optional(),
	bucketSortOrder: SortOrderSchema.optional(),
	binSortOrder: SortOrderSchema.optional(),
});

export const oneToManyDyadCensusPromptSchema = promptSchema.extend({
	createEdge: z.string().generateMock(() => randomEdgeType()),
	bucketSortOrder: SortOrderSchema.optional(),
	binSortOrder: SortOrderSchema.optional(),
});

export const geospatialPromptSchema = promptSchema
	.extend({
		variable: z.string().generateMock(() => randomVariable()),
	})
	.strict();
