import { getEgoVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { FormSchema, IntroductionPanelSchema } from "../../8/common";
import { baseStageEntitySchema } from "./base";

export const egoFormStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("EgoForm"),
		form: FormSchema,
		introductionPanel: IntroductionPanelSchema,
	})
	.generateMock((base) => ({
		...base,
		form: {
			fields: [
				{ variable: getEgoVariableId(0), prompt: "What is your first name?" },
				{ variable: getEgoVariableId(1), prompt: "What is your age?" },
				{
					variable: getEgoVariableId(2),
					prompt: "What is your date of birth?",
				},
			],
		},
	}));
