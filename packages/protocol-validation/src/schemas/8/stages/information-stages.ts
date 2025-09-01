import { z } from "zod";
import { findDuplicateId } from "../../../utils/validation-helpers";
import { baseStageSchema } from "./base";

// TODO: Should be narrowed based on type
const ItemSchema = z
	.object({
		id: z.string(),
		type: z.enum(["text", "asset"]),
		content: z.string(),
		description: z.string().optional(),
		size: z.string().optional(),
		loop: z.boolean().optional(),
	})
	.strict();

export type Item = z.infer<typeof ItemSchema>;

export const informationStage = baseStageSchema.extend({
	type: z.literal("Information"),
	title: z.string().optional(),
	items: z.array(ItemSchema).superRefine((items, ctx) => {
		// Check for duplicate item IDs
		const duplicateItemId = findDuplicateId(items);
		if (duplicateItemId) {
			ctx.addIssue({
				code: "custom" as const,
				message: `Items contain duplicate ID "${duplicateItemId}"`,
				path: [],
			});
		}
	}),
});

export const anonymisationStage = baseStageSchema.extend({
	type: z.literal("Anonymisation"),
	explanationText: z.object({ title: z.string(), body: z.string() }).strict(),
	validation: z
		.object({
			minLength: z.number().int().optional(),
			maxLength: z.number().int().optional(),
		})
		.optional(),
});
