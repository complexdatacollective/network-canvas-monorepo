import { z } from "../../../utils/zod-mock-extension";

export const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => "Person"),
	})
	.strict();

export const EdgeStageSubjectSchema = z
	.object({
		entity: z.literal("edge"),
		type: z.string().generateMock(() => "knows"),
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
