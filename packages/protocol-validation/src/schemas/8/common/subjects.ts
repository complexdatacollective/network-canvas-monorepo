import { z } from "src/utils/zod-mock-extension";
import { randomNodeType, randomEdgeType } from "../../../utils/mock-ids";

export const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => randomNodeType()),
	})
	.strict();

export const EdgeStageSubjectSchema = z
	.object({
		entity: z.literal("edge"),
		type: z.string().generateMock(() => randomEdgeType()),
	})
	.strict();

export const EgoStageSubjectSchema = z
	.object({
		entity: z.literal("ego"),
	})
	.strict();

export const StageSubjectSchema = z
	.union([EgoStageSubjectSchema, NodeStageSubjectSchema, EdgeStageSubjectSchema])
	.generateMock(() => NodeStageSubjectSchema.generateMock());

export type StageSubject = z.infer<typeof StageSubjectSchema>;
