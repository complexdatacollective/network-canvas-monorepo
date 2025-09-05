import { VariableNameSchema } from "@codaco/shared-consts";
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
		// minimal codebook, could be expanded later on
		const personNode = NodeDefinitionSchema.generateMock();
		const friendshipEdge = EdgeDefinitionSchema.generateMock();
		const ego = EgoDefinitionSchema.generateMock();

		return {
			node: {
				person: { ...personNode, name: "Person" },
			},
			edge: {
				friendship: { ...friendshipEdge, name: "Friendship" },
			},
			ego: ego,
		};
	});

export type Codebook = z.infer<typeof CodebookSchema>;
