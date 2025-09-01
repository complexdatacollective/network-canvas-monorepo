import { z } from "zod";

export const filterRuleSchema = z
	.object({
		type: z.enum(["alter", "ego", "edge"]),
		id: z.string(),
		options: z
			.object({
				type: z.string().optional(),
				attribute: z.string().optional(),
				operator: z.enum([
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
				]),
				value: z.union([z.number().int(), z.string(), z.boolean(), z.array(z.any())]).optional(),
			})
			.strict(),
	})
	.strict();

export type FilterRule = z.infer<typeof filterRuleSchema>;

const singleFilterRuleSchema = z
	.object({
		join: z.enum(["OR", "AND"]).optional(),
		rules: z.array(filterRuleSchema).max(1),
	})
	.strict();

const multipleFilterRuleSchema = z
	.object({
		join: z.enum(["OR", "AND"]),
		rules: z.array(filterRuleSchema).min(2),
	})
	.strict();

export const FilterSchema = z.union([singleFilterRuleSchema, multipleFilterRuleSchema]);

export type Filter = z.infer<typeof FilterSchema>;
