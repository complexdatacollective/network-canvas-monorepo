import { getEdgeTypeId, getEdgeVariableId, getNodeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { FormFieldSchema, familyPedigreeNominationPromptSchema } from "../../8/common";
import { baseStageEntitySchema } from "./base";

export const NodeConfigSchema = z.object({
	type: z.string().generateMock(() => getNodeTypeId()),
	nodeLabelVariable: z.string().generateMock(() => getNodeVariableId()),
	egoVariable: z.string().generateMock(() => getNodeVariableId()),
	biologicalSexVariable: z.string().generateMock(() => getNodeVariableId()),
	relationshipVariable: z.string().generateMock(() => getNodeVariableId()),
	form: z.array(FormFieldSchema).optional(),
});

export const EdgeConfigSchema = z.object({
	type: z.string().generateMock(() => getEdgeTypeId()),
	relationshipTypeVariable: z.string().generateMock(() => getEdgeVariableId()),
	isActiveVariable: z.string().generateMock(() => getEdgeVariableId()),
	isGestationalCarrierVariable: z.string().generateMock(() => getEdgeVariableId()),
});

export const familyPedigreeStageEntity = baseStageEntitySchema.extend({
	stageType: z.literal("FamilyPedigree"),
	nodeConfig: NodeConfigSchema,
	edgeConfig: EdgeConfigSchema,
	censusPrompt: z.string(),
	nominationPrompts: z.array(familyPedigreeNominationPromptSchema).optional(),
});
