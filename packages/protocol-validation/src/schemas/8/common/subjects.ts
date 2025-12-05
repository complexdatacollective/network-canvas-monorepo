import { getEdgeTypeId, getNodeTypeId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";

export const NodeStageSubjectSchema = z.strictObject({
	entity: z.literal("node"),
	type: z.string().generateMock(() => getNodeTypeId()),
});

export const EdgeStageSubjectSchema = z.strictObject({
	entity: z.literal("edge"),
	type: z.string().generateMock(() => getEdgeTypeId()),
});

export const EgoStageSubjectSchema = z.strictObject({
	entity: z.literal("ego"),
});

export const StageSubjectSchema = z
	.union([EgoStageSubjectSchema, NodeStageSubjectSchema, EdgeStageSubjectSchema])
	.generateMock(() => NodeStageSubjectSchema.generateMock());

export type StageSubject = z.infer<typeof StageSubjectSchema>;
