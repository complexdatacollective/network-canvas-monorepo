import { z } from "zod";
import { baseStageSchema } from "./base";
import { FormSchema } from "../common";

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

export const egoFormStage = baseStageSchema.extend({
	type: z.literal("EgoForm"),
	form: FormSchema,
});

export const alterFormStage = baseStageSchema.extend({
	type: z.literal("AlterForm"),
	subject: NodeStageSubjectSchema,
	form: FormSchema,
});

export const alterEdgeFormStage = baseStageSchema.extend({
	type: z.literal("AlterEdgeForm"),
	subject: EdgeStageSubjectSchema,
	form: FormSchema,
});
