import { getEdgeVariableId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { EdgeStageSubjectSchema, FormSchema, NodeStageSubjectSchema, promptSchema } from "../common";
import { baseStageSchema } from "./base";

export const familyTreeCensusStage = baseStageSchema
	.extend({
		type: z.literal("FamilyTreeCensus"),
		// The node type that is created when nodes are added
		subject: NodeStageSubjectSchema,
		// The edge type created when any kind of family relationship exists
		edgeType: EdgeStageSubjectSchema, // family relationship
		// Variable on edgeType used to store the type of family relationship
		relationshipTypeVariable: z.string().generateMock(() => getEdgeVariableId(0)), // partner, parent, ex-partner.
		// Variable on node type used to collect the relationship to the ego. Optional, as this may not be collected.
		relationshipToEgoVariable: z
			.string()
			.optional()
			.generateMock(() => getNodeVariableId(1)),
		// Biological sex variable present on node type. Optional, as this may not be collected.
		sexVariable: z
			.string()
			.optional()
			.generateMock(() => getNodeVariableId(1)),
		// Variable on node type used to differentiate the ego network node from other network nodes.
		nodeIsEgoVariable: z.boolean().generateMock(() => false),
		scaffoldingStep: z.object({
			text: z.string().generateMock(() => "create a family tree"),
			showQuickStartModal: z.boolean().generateMock(() => true),
		}),
		nameGenerationStep: z.object({
			text: z.string().generateMock(() => "name family members"),
			form: FormSchema,
		}),
		diseaseNominationStep: z
			.array(
				promptSchema.extend({
					variable: z.string().generateMock(() => getNodeVariableId(0)),
				}),
			)
			.optional(),
	})
	.generateMock((base) => ({
		...base,
	}));
