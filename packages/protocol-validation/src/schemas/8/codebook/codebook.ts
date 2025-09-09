import { VariableNameSchema } from "@codaco/shared-consts";
import { getEdgeTypeId, getNodeTypeId } from "src/utils/mock-seeds";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateName, getAllEntityNames } from "../../../utils/validation-helpers";
import { EdgeDefinitionSchema, EgoDefinitionSchema, NodeDefinitionSchema } from "./definitions";

export const CodebookSchema = z
	.object({
		node: z.record(VariableNameSchema, NodeDefinitionSchema).optional(),
		edge: z.record(VariableNameSchema, EdgeDefinitionSchema).optional(),
		ego: EgoDefinitionSchema.optional(),
	})
	.strict()
	.superRefine((codebook, ctx) => {
		// Check for duplicate entity names across all entity types
		const entityNames = getAllEntityNames(codebook);
		const duplicateEntityName = findDuplicateName(entityNames);
		if (duplicateEntityName) {
			ctx.addIssue({
				code: "custom" as const,
				message: `Duplicate entity name "${duplicateEntityName}"`,
				path: [],
			});
		}
	})
	.generateMock(() => {
		const personNode = NodeDefinitionSchema.generateMock();
		const orgNode = NodeDefinitionSchema.generateMock();
		const friendshipEdge = EdgeDefinitionSchema.generateMock();
		const worksWithEdge = EdgeDefinitionSchema.generateMock();
		const ego = EgoDefinitionSchema.generateMock();

		// Remove 'unique' validation from ego variables
		// can't think of a better way to do this
		if (ego.variables) {
			for (const variable of Object.values(ego.variables)) {
				if ("validation" in variable && variable.validation && "unique" in variable.validation) {
					// biome-ignore lint/performance/noDelete: safe in mock context
					delete (variable.validation as { unique?: boolean }).unique;
				}
			}
		}

		return {
			node: {
				[getNodeTypeId(0)]: { ...personNode, name: "Person" },
				[getNodeTypeId(1)]: { ...orgNode, name: "Organization" },
			},
			edge: {
				[getEdgeTypeId(0)]: { ...friendshipEdge, name: "Friendship" },
				[getEdgeTypeId(1)]: { ...worksWithEdge, name: "WorksWith" },
			},
			ego: ego,
		};
	});

export type Codebook = z.infer<typeof CodebookSchema>;
