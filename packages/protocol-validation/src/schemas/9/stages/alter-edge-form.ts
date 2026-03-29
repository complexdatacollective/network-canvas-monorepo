import { faker } from "@faker-js/faker";
import { getEdgeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { EdgeStageSubjectSchema, FormSchema, IntroductionPanelSchema } from "../../8/common";
import { baseStageEntitySchema } from "./base";

export const alterEdgeFormStageEntity = baseStageEntitySchema
	.extend({
		stageType: z.literal("AlterEdgeForm"),
		subject: EdgeStageSubjectSchema,
		form: FormSchema,
		introductionPanel: IntroductionPanelSchema,
	})
	.generateMock((base) => ({
		...base,
		form: {
			fields: [
				{
					variable: getEdgeVariableId(0),
					prompt: faker.helpers.arrayElement([
						"How strong is this relationship?",
						"Rate the strength of this connection",
						"How close are they?",
					]),
				},
				{
					variable: getEdgeVariableId(1),
					prompt: faker.helpers.arrayElement([
						"How often do they interact?",
						"Frequency of contact",
						"How often do they communicate?",
					]),
				},
				{
					variable: getEdgeVariableId(2),
					prompt: faker.helpers.arrayElement([
						"What type of relationship is this?",
						"How would you describe this relationship?",
						"Nature of their connection?",
					]),
				},
			],
		},
	}));
