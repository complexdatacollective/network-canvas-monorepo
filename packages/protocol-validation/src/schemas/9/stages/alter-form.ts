import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { FormSchema, IntroductionPanelSchema, NodeStageSubjectSchema } from "../../8/common";
import { FilterSchema } from "../../8/filters";
import { baseStageEntitySchema } from "./base";

export const alterFormStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("AlterForm"),
		filter: FilterSchema.optional(),
		subject: NodeStageSubjectSchema,
		form: FormSchema,
		introductionPanel: IntroductionPanelSchema,
	})
	.generateMock((base) => ({
		...base,
		form: {
			fields: [
				{
					variable: getNodeVariableId(0),
					prompt: faker.helpers.arrayElement(["How old is this person?", "What is their age?", "Age of this person?"]),
				},
				{
					variable: getNodeVariableId(1),
					prompt: faker.helpers.arrayElement([
						"What is their occupation?",
						"What do they do for work?",
						"Their job or profession?",
					]),
				},
				{
					variable: getNodeVariableId(2),
					prompt: faker.helpers.arrayElement([
						"How long have you known them?",
						"Length of relationship?",
						"Years you've known this person?",
					]),
				},
			],
		},
	}));
