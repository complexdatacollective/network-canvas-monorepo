import { getEgoVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { FormSchema, IntroductionPanelSchema } from "../common";
import { baseStageSchema } from "./base";

export const egoFormStage = baseStageSchema
	.extend({
		type: z.literal("EgoForm"),
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
