import { faker } from "@faker-js/faker";
import { z } from "~/utils/zod-mock-extension";
import { EdgeVariablesSchema, EgoVariablesSchema, VariablesSchema } from "../variables";

export const NodeColorSequence = [
	"node-color-seq-1",
	"node-color-seq-2",
	"node-color-seq-3",
	"node-color-seq-4",
	"node-color-seq-5",
	"node-color-seq-6",
	"node-color-seq-7",
	"node-color-seq-8",
] as const;

export type NodeColor = (typeof NodeColorSequence)[number];

const NodeDefinitionSchema = z
	.object({
		name: z.string(),
		iconVariant: z
			.string()
			.optional()
			.generateMock(() => "add-a-person"),
		// Always generate variables in mocks
		variables: VariablesSchema.optional().generateMock(() => VariablesSchema.generateMock()),
		color: z
			.union(NodeColorSequence.map((color) => z.literal(color)))
			.generateMock(() => faker.helpers.arrayElement(NodeColorSequence)),
	})
	.strict();

export { NodeDefinitionSchema };
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export const EdgeColorSequence = [
	"edge-color-seq-1",
	"edge-color-seq-2",
	"edge-color-seq-3",
	"edge-color-seq-4",
	"edge-color-seq-5",
	"edge-color-seq-6",
	"edge-color-seq-7",
	"edge-color-seq-8",
] as const;

export type EdgeColor = (typeof EdgeColorSequence)[number];

const EdgeDefinitionSchema = z
	.object({
		name: z.string(),
		color: z
			.union(EdgeColorSequence.map((color) => z.literal(color)))
			.optional()
			.generateMock(() => faker.helpers.arrayElement(EdgeColorSequence)),
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
