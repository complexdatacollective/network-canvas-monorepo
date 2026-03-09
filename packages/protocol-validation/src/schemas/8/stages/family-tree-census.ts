import { faker } from "@faker-js/faker";
import { getEdgeTypeId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { EdgeStageSubjectSchema, FormSchema, NodeStageSubjectSchema, promptSchema } from "../common";
import { baseStageSchema } from "./base";

export const familyCensusStage = baseStageSchema.extend({
	type: z.literal("FamilyTreeCensus"),
	// The mode of family tree census, which determines the type of relationships that are captured and how they are represented in the data model.
	mode: z.enum(["sociological", "biological"]).generateMock(() => "sociological"),
	// Biological sex variable on the ego entity.
	egoSexVariable: z.string().generateMock(() => getNodeVariableId(1)),
	edgeOptions: z.object({
		// The edge type created between two nodes when any kind of family relationship exists
		edgeType: EdgeStageSubjectSchema,
		// Variable on edgeType used to store the type of family relationship between two alters
		relationshipTypeVariable: z.string().generateMock(() => getEdgeTypeId(0)), // partner, parent, ex-partner.
		// Variable on node type used to collect the relationship to the ego.
		relationshipToEgoVariable: z.string().generateMock(() => getNodeVariableId(0)),
	}),

	nodeOptions: z.object({
		// The node type that is created for each family member in the census, and used to store attributes about them.
		nodeType: NodeStageSubjectSchema,
		// Biological sex variable on the node type.
		sexVariable: z.string().generateMock(() => getNodeVariableId(2)),
		// Variable on node type used to differentiate the ego node from other network nodes. Must be a boolean.
		isEgoVariable: z.string().generateMock(() => getNodeVariableId(3)),
	}),
	// The method used when adding details about each family member. Can be either a form with predefined
	// questions, or a quick add mode where details are added later in the protocol.
	nameGenerationStep: z.union([
		z.object({
			mode: z.literal("form"),
			form: FormSchema,
		}),
		z.object({
			mode: z.literal("quickAdd"),
			variable: z.string().generateMock(() => getNodeVariableId(4)),
		}),
	]),
	// Optional disease nomination step, where named family members can be nominated as having a disease
	// or condition of interest.
	diseaseNominationStep: z
		.array(
			promptSchema.extend({
				variable: z.string().generateMock(() => getNodeVariableId(0)),
			}),
		)
		.optional()
		.generateMock(() =>
			faker.helpers.arrayElements(
				[3, 4, 5, 6, 7].map((_item, index) => ({
					id: crypto.randomUUID(),
					text: `disease nomination prompt ${index + 1}`,
					variable: getNodeVariableId(index),
				})),
				{ min: 1, max: 3 },
			),
		),
});
