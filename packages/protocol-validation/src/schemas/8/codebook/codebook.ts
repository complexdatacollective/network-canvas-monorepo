import { VariableNameSchema } from "@codaco/shared-consts";
import { z } from "zod";
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
	});

export type Codebook = z.infer<typeof CodebookSchema>;
