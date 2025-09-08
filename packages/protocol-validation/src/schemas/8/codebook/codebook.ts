import { VariableNameSchema } from "@codaco/shared-consts";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateName, getAllEntityNames } from "../../../utils/validation-helpers";
import { MOCK_IDS } from "../../../utils/mock-ids";
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

		return {
			node: {
				[MOCK_IDS.nodeTypes[0]]: { ...personNode, name: "Person" },
				[MOCK_IDS.nodeTypes[1]]: { ...orgNode, name: "Organization" },
			},
			edge: {
				[MOCK_IDS.edgeTypes[0]]: { ...friendshipEdge, name: "Friendship" },
				[MOCK_IDS.edgeTypes[1]]: { ...worksWithEdge, name: "WorksWith" },
			},
			ego: ego,
		};
	});

export type Codebook = z.infer<typeof CodebookSchema>;
