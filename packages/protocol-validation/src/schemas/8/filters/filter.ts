import { faker } from "@faker-js/faker";
import { getNodeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";

export const filterRuleSchema = z.strictObject({
	type: z.enum(["node", "ego", "edge"]).generateMock(() => "node" as const),
	id: z.string(),
	options: z.strictObject({
		type: z
			.string()
			.optional()
			.generateMock(() => getNodeTypeId()),
		attribute: z
			.string()
			.optional()
			.generateMock(() => getNodeVariableId()),
		operator: z.union([
			// TODO: this can be narrowed based on `type` and `attribute`
			z.literal("EXISTS"),
			z.literal("NOT_EXISTS"),
			z.literal("EXACTLY"),
			z.literal("NOT"),
			z.literal("GREATER_THAN"),
			z.literal("GREATER_THAN_OR_EQUAL"),
			z.literal("LESS_THAN"),
			z.literal("LESS_THAN_OR_EQUAL"),
			z.literal("INCLUDES"),
			z.literal("EXCLUDES"),
			z.literal("OPTIONS_GREATER_THAN"),
			z.literal("OPTIONS_LESS_THAN"),
			z.literal("OPTIONS_EQUALS"),
			z.literal("OPTIONS_NOT_EQUALS"),
			z.literal("CONTAINS"),
			z.literal("DOES_NOT_CONTAIN"),
		]),

		value: z
			.union([z.number().int(), z.string(), z.boolean(), z.array(z.any())])
			.optional()
			.generateMock(() => faker.string.alpha(5)),
	}),
});

export type FilterRule = z.infer<typeof filterRuleSchema>;

const singleFilterRuleSchema = z.strictObject({
	join: z.enum(["OR", "AND"]).optional(),
	rules: z
		.array(filterRuleSchema)
		.max(1)
		.generateMock(() => [filterRuleSchema.generateMock()]),
});

const multipleFilterRuleSchema = z.strictObject({
	join: z.enum(["OR", "AND"]).generateMock(() => "AND" as const),
	rules: z
		.array(filterRuleSchema)
		.generateMock(() => [filterRuleSchema.generateMock(), filterRuleSchema.generateMock()]),
});

export const FilterSchema = z
	.union([singleFilterRuleSchema, multipleFilterRuleSchema])
	.generateMock(() => singleFilterRuleSchema.generateMock());

export type Filter = z.infer<typeof FilterSchema>;
