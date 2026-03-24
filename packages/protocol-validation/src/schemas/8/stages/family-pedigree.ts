import { getEdgeTypeId, getEdgeVariableId, getNodeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { FormFieldSchema, familyPedigreeNominationPromptSchema } from "../common";
import { baseStageSchema } from "./base";

export const NodeConfigSchema = z.object({
	// Node type for alter nodes in the codebook
	type: z.string().generateMock(() => getNodeTypeId()),
	// Boolean variable marking the ego node
	egoVariable: z.string().generateMock(() => getNodeVariableId()),
	// Categorical variable storing the biological sex of the node (male, female, intersex, unknown)
	biologicalSexVariable: z.string().generateMock(() => getNodeVariableId()),
	// String variable storing the relationship to ego (e.g. 'sibling', 'parent')
	relationshipVariable: z.string().generateMock(() => getNodeVariableId()),
	// Form fields collected when creating a node
	form: z.array(FormFieldSchema),
});

export const EdgeConfigSchema = z.object({
	// Edge type in the codebook (single type for both parent and partner edges)
	type: z.string().generateMock(() => getEdgeTypeId()),
	// Variable storing the relationship type value (discriminant for the Edge union)
	relationshipTypeVariable: z.string().generateMock(() => getEdgeVariableId()),
	// Variable storing whether the relationship is currently active
	isActiveVariable: z.string().generateMock(() => getEdgeVariableId()),
	// Variable storing gestational carrier status (parent edges only)
	isGestationalCarrierVariable: z.string().generateMock(() => getEdgeVariableId()),
});

export const familyPedigreeStage = baseStageSchema.extend({
	type: z.literal("FamilyPedigree"),
	nodeConfig: NodeConfigSchema,
	edgeConfig: EdgeConfigSchema,

	// Prompt shown during the family building phase
	censusPrompt: z.string(),
	// Optional attribute nomination steps (e.g. disease nomination)
	nominationPrompts: z.array(familyPedigreeNominationPromptSchema).optional(),
});
