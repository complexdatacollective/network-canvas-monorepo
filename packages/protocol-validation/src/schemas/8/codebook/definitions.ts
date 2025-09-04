import { z } from "../../../utils/zod-mock-extension";
import { VariablesSchema } from "../variables";

const NodeDefinitionSchema = z
	.object({
		name: z.string().generateMock(() => "Person"),
		iconVariant: z
			.string()
			.optional()
			.generateMock(() => "add-a-person"),
		variables: VariablesSchema.optional(),
		color: z.string().generateMock(() => "node-color-seq-1"),
	})
	.strict();

export { NodeDefinitionSchema };
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

const EdgeDefinitionSchema = z
	.object({
		name: z.string().generateMock(() => "Friends"),
		color: z.string().generateMock(() => "edge-color-seq-1"),
		variables: VariablesSchema.optional(),
	})
	.strict();

export { EdgeDefinitionSchema };
export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;

const EgoDefinitionSchema = z
	.strictObject({
		variables: VariablesSchema.optional(),
	})
	.superRefine((egoDef, ctx) => {
		// Validate ego-specific constraints
		if (egoDef.variables) {
			for (const [varId, variable] of Object.entries(egoDef.variables)) {
				if (
					variable &&
					typeof variable === "object" &&
					"validation" in variable &&
					variable.validation &&
					typeof variable.validation === "object"
				) {
					const validation = variable.validation as Record<string, unknown>;

					// Check that unique validation is not used on ego variables
					if (validation.unique) {
						ctx.addIssue({
							code: "custom" as const,
							message: `The 'unique' variable validation cannot be used on ego variables. Was used on ego variable "${varId}".`,
							path: ["variables", varId, "validation", "unique"],
						});
					}
				}
			}
		}
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
