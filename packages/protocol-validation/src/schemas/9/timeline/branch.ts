import { findDuplicateId } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { FilterSchema } from "../../8/filters/filter";

const BranchSlotSchema = z.strictObject({
	id: z.string(),
	label: z.string(),
	filter: FilterSchema.optional(),
	default: z.literal(true).optional(),
	target: z.string(),
});

export type BranchSlot = z.infer<typeof BranchSlotSchema>;

export const branchEntitySchema = z.strictObject({
	id: z.string(),
	type: z.literal("Branch"),
	name: z.string(),
	slots: z
		.array(BranchSlotSchema)
		.min(2)
		.superRefine((slots, ctx) => {
			const duplicateId = findDuplicateId(slots);
			if (duplicateId) {
				ctx.addIssue({
					code: "custom",
					message: `Branch slots contain duplicate ID "${duplicateId}"`,
				});
			}

			const defaultSlots = slots.filter((s) => s.default === true);
			if (defaultSlots.length === 0) {
				ctx.addIssue({
					code: "custom",
					message: "Branch must have exactly one default slot",
				});
			}
			if (defaultSlots.length > 1) {
				ctx.addIssue({
					code: "custom",
					message: "Branch must have exactly one default slot, found multiple",
				});
			}

			for (const slot of slots) {
				if (!slot.default && !slot.filter) {
					ctx.addIssue({
						code: "custom",
						message: `Non-default slot "${slot.id}" must have a filter`,
					});
				}
			}
		}),
});

export type BranchEntity = z.infer<typeof branchEntitySchema>;
