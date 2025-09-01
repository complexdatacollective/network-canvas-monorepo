import { z } from "zod";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string(),
	})
	.strict();

const EdgeStageSubjectSchema = z
	.object({
		entity: z.literal("edge"),
		type: z.string(),
	})
	.strict();

const EgoStageSubjectSchema = z
	.object({
		entity: z.literal("ego"),
	})
	.strict();

export const StageSubjectSchema = z.union([EgoStageSubjectSchema, NodeStageSubjectSchema, EdgeStageSubjectSchema]);

export type StageSubject = z.infer<typeof StageSubjectSchema>;
