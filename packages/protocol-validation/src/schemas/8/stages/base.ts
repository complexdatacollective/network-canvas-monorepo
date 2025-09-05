import { randomItem } from "src/utils/zod-mock-extension";
import { z } from "zod";
import { SkipLogicSchema } from "../common";
import { FilterSchema } from "../filters";

export const baseStageSchema = z
	.object({
		id: z.string(),
		interviewScript: z.string().optional(),
		label: z.string(),
		filter: FilterSchema.optional(),
		skipLogic: SkipLogicSchema.optional(),
		introductionPanel: z
			.object({
				title: z.string(),
				text: z.string(),
			})
			.strict()
			.optional(),
	})
	.generateMock(() => {
		const stageNames = ["Introduction", "Consent Form", "Person Sociogram"] as const;

		return {
			id: `stage_${Math.random().toString(36).substring(2, 8)}`,
			label: randomItem(stageNames),
			interviewScript: Math.random() < 0.5 ? "This is the script text." : undefined,
			introductionPanel: {
				title: "Welcome",
				text: "Thank you for participating in this study.",
			},
		};
	});
