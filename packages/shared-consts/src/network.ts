import { z } from "zod";
import { VariableNameSchema } from "./variables";

// When values are encrypted, this is the resulting type.
const encryptedValueSchema = z.array(z.number());
export type EncryptedValue = z.infer<typeof encryptedValueSchema>;

const variableValueSchema = z
	.union([
		z.string(),
		z.boolean(),
		z.number(),
		encryptedValueSchema,
		z.array(z.union([z.string(), z.number(), z.boolean()])), // Ordinal
		z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])), // Categorical
		z.object({
			x: z.number(),
			y: z.number(),
		}), // layout
	])
	.nullable();

export type VariableValue = z.infer<typeof variableValueSchema>;

export const entityPrimaryKeyProperty = "_uid";
export type EntityPrimaryKey = typeof entityPrimaryKeyProperty;
export const entitySecureAttributesMeta = "_secureAttributes";
export type EntitySecureAttributesMeta = typeof entitySecureAttributesMeta;
export const entityAttributesProperty = "attributes";
export type EntityAttributesProperty = typeof entityAttributesProperty;
export const edgeSourceProperty = "from";
export const edgeTargetProperty = "to";

const BaseNcEntitySchema = z.object({
	[entityPrimaryKeyProperty]: z.string().readonly(),
	[entityAttributesProperty]: z.record(VariableNameSchema, variableValueSchema),
	[entitySecureAttributesMeta]: z
		.record(
			z.object({
				iv: z.array(z.number()),
				salt: z.array(z.number()),
			}),
		)
		.optional(),
});

const NcNodeSchema = BaseNcEntitySchema.extend({
	type: z.string(),
	stageId: z.string().optional(),
	promptIDs: z.array(z.string()).optional(),
});

export type NcNode = z.infer<typeof NcNodeSchema>;

export const NcEdgeSchema = BaseNcEntitySchema.extend({
	type: z.string(),
	from: z.string(),
	to: z.string(),
});

export type NcEdge = z.infer<typeof NcEdgeSchema>;

export const NcEntity = z.union([NcNodeSchema, NcEdgeSchema, BaseNcEntitySchema]);
export type NcEntity = z.infer<typeof NcEntity>;

export type NcEgo = z.infer<typeof BaseNcEntitySchema>;

export const NcNetworkSchema = z.object({
	nodes: z.array(NcNodeSchema),
	edges: z.array(NcEdgeSchema),
	ego: BaseNcEntitySchema.optional(),
});

export type NcNetwork = {
	nodes: NcNode[];
	edges: NcEdge[];
	ego: NcEgo; // I've been back and forth on if ego should be optional, but Interviewers redux store defines it, so non-optional for now.
};
