import { getNodeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";

// Operators valid when checking entity type existence (no attribute specified)
export const TypeLevelOperators = z.enum(["EXISTS", "NOT_EXISTS"]);

// All operators (attribute-level validation happens in logic validation based on variable type)
export const AllOperators = z.enum([
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
	"DOES_NOT_CONTAIN",
]);

export type FilterOperator = z.infer<typeof AllOperators>;

// Operator sets by variable type (used in logic validation)
export const BaseOperators = ["EXISTS", "NOT_EXISTS", "EXACTLY", "NOT"] as const;
export const TextOperators = [...BaseOperators, "CONTAINS", "DOES_NOT_CONTAIN"] as const;
export const NumericOperators = [
	...BaseOperators,
	"GREATER_THAN",
	"GREATER_THAN_OR_EQUAL",
	"LESS_THAN",
	"LESS_THAN_OR_EQUAL",
] as const;
export const CategoricalOperators = [
	...BaseOperators,
	"INCLUDES",
	"EXCLUDES",
	"OPTIONS_GREATER_THAN",
	"OPTIONS_LESS_THAN",
	"OPTIONS_EQUALS",
	"OPTIONS_NOT_EQUALS",
] as const;
export const OrdinalOperators = [...BaseOperators, "INCLUDES", "EXCLUDES"] as const;

// Map variable types to their valid operators
export const OperatorsByVariableType: Record<string, readonly string[]> = {
	boolean: BaseOperators,
	text: TextOperators,
	number: NumericOperators,
	scalar: NumericOperators,
	datetime: NumericOperators,
	ordinal: OrdinalOperators,
	categorical: CategoricalOperators,
	layout: BaseOperators,
	location: BaseOperators,
};

// Value schema with custom mock generator to avoid z.any() traversal
const filterValueSchema = z
	.union([z.number().int(), z.string(), z.boolean(), z.array(z.any())])
	.optional()
	.generateMock(() => "test-value");

// Options schema for type-level rules (no attribute - checking entity existence)
const typeLevelOptionsSchema = z
	.strictObject({
		type: z
			.string()
			.optional()
			.generateMock(() => getNodeTypeId()),
		operator: TypeLevelOperators,
		value: filterValueSchema,
	})
	.generateMock(() => ({
		type: getNodeTypeId(),
		operator: "EXISTS" as const,
	}));

// Options schema for attribute-level rules (attribute specified - checking variable value)
const attributeLevelOptionsSchema = z
	.strictObject({
		type: z
			.string()
			.optional()
			.generateMock(() => getNodeTypeId()),
		attribute: z.string().generateMock(() => getNodeVariableId()),
		operator: AllOperators,
		value: filterValueSchema,
	})
	.generateMock(() => ({
		type: getNodeTypeId(),
		attribute: getNodeVariableId(),
		operator: "EXACTLY" as const,
		value: "test",
	}));

// Type-level filter rule (no attribute - EXISTS/NOT_EXISTS only)
const typeLevelFilterRuleSchema = z
	.strictObject({
		type: z.enum(["node", "ego", "edge"]).generateMock(() => "node" as const),
		id: z.string(),
		options: typeLevelOptionsSchema,
	})
	.generateMock(() => ({
		type: "node" as const,
		id: crypto.randomUUID(),
		options: typeLevelOptionsSchema.generateMock(),
	}));

// Attribute-level filter rule (attribute specified - all operators valid at schema level)
const attributeLevelFilterRuleSchema = z
	.strictObject({
		type: z.enum(["node", "ego", "edge"]).generateMock(() => "node" as const),
		id: z.string(),
		options: attributeLevelOptionsSchema,
	})
	.generateMock(() => ({
		type: "node" as const,
		id: crypto.randomUUID(),
		options: attributeLevelOptionsSchema.generateMock(),
	}));

// Combined filter rule schema using discriminated union
export const filterRuleSchema = z
	.union([attributeLevelFilterRuleSchema, typeLevelFilterRuleSchema])
	.generateMock(() => attributeLevelFilterRuleSchema.generateMock());

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
