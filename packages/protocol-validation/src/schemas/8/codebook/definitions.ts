import { z } from "../../../utils/zod-mock-extension";
import { EdgeVariablesSchema, EgoVariablesSchema, VariablesSchema } from "../variables";

const NodeDefinitionSchema = z
	.object({
		name: z.string(),
		iconVariant: z
			.string()
			.optional()
			.generateMock(() => "add-a-person"),
		// Always generate variables in mocks
		variables: VariablesSchema.optional().generateMock(() => VariablesSchema.generateMock()),
		color: z.string().generateMock(() => "node-color-seq-1"),
	})
	.strict();

export { NodeDefinitionSchema };
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

const EdgeDefinitionSchema = z
	.object({
		name: z.string(),
		color: z.string().generateMock(() => "edge-color-seq-1"),
		variables: EdgeVariablesSchema.optional(),
	})
	.strict();

export { EdgeDefinitionSchema };
export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;

const EgoDefinitionSchema = z.strictObject({
	variables: EgoVariablesSchema.optional(),
});

export { EgoDefinitionSchema };
export type EgoDefinition = z.infer<typeof EgoDefinitionSchema>;

export const EntityDefinition = z.union([NodeDefinitionSchema, EdgeDefinitionSchema, EgoDefinitionSchema]);

export type EntityDefinition = z.infer<typeof EntityDefinition>;

type AllKeys<T> = T extends unknown ? keyof T : never;
export type NodeDefinitionKeys = AllKeys<NodeDefinition>;
export type EdgeDefinitionKeys = AllKeys<EdgeDefinition>;
export type EgoDefinitionKeys = AllKeys<EgoDefinition>;
export type EntityDefinitionKeys = AllKeys<EntityDefinition>;
