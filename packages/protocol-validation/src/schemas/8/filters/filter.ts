import { z } from "src/utils/zod-mock-extension";

export const filterRuleSchema = z
	.object({
		type: z.enum(["node", "ego", "edge"]).generateMock(() => "node" as const),
		id: z.string().generateMock(() => `filter_rule_${crypto.randomUUID()}`),
		options: z
			.object({
				type: z
					.string()
					.optional()
					.generateMock(() => "person"),
				attribute: z
					.string()
					.optional()
					.generateMock(() => "first_name"),
				operator: z
					.enum([
						// TODO: this can be narrowed based on `type` and `attribute`
						"EXISTS",
						"NOT_EXISTS",
						"EXACTLY",
						"NOT",
						"GREATER_THAN",
						"GREATER_THAN_OR_EQUAL",
						"LESS_THAN",
						"LESS_THAN_OR_EQUAL",
						"INCLUDES",
						"EXCLUDES",
						"OPTIONS_GREATER_THAN",
						"OPTIONS_LESS_THAN",
						"OPTIONS_EQUALS",
						"OPTIONS_NOT_EQUALS",
						"CONTAINS",
						"DOES NOT CONTAIN",
					])
					.generateMock(() => "EXISTS" as const),
				value: z
					.union([z.number().int(), z.string(), z.boolean(), z.array(z.any())])
					.optional()
					.generateMock(() => "test_value"),
			})
			.strict(),
	})
	.strict();

export type FilterRule = z.infer<typeof filterRuleSchema>;

const singleFilterRuleSchema = z
	.object({
		join: z.enum(["OR", "AND"]).optional(),
		rules: z
			.array(filterRuleSchema)
			.max(1)
			.generateMock(() => [filterRuleSchema.generateMock()]),
	})
	.strict();

const multipleFilterRuleSchema = z
	.object({
		join: z.enum(["OR", "AND"]).generateMock(() => "AND" as const),
		rules: z
			.array(filterRuleSchema)
			.min(2)
			.generateMock(() => [filterRuleSchema.generateMock(), filterRuleSchema.generateMock()]),
	})
	.strict();

export const FilterSchema = z
	.union([singleFilterRuleSchema, multipleFilterRuleSchema])
	.generateMock(() => singleFilterRuleSchema.generateMock());

export type Filter = z.infer<typeof FilterSchema>;
