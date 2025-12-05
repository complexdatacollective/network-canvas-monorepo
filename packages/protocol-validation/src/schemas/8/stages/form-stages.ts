import { faker } from "@faker-js/faker";
import { getEdgeVariableId, getEgoVariableId, getNodeVariableId } from "~/utils/mock-seeds";
import { z } from "~/utils/zod-mock-extension";
import { EdgeStageSubjectSchema, FormSchema, NodeStageSubjectSchema } from "../common";
import { FilterSchema } from "../filters";
import { baseStageSchema } from "./base";

export const egoFormStage = baseStageSchema
	.extend({
		type: z.literal("EgoForm"),
		form: FormSchema,
	})
	.generateMock((base) => ({
		...base,
		type: "EgoForm",
		introductionPanel: {
			title: faker.helpers.arrayElement([
				"Consent Form",
				"Personal Information",
				"Background Questions",
				"Participant Details",
			]),
			text: "Please answer the following questions about yourself.",
		},
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

export const alterFormStage = baseStageSchema
	.extend({
		type: z.literal("AlterForm"),
		filter: FilterSchema.optional(),
		subject: NodeStageSubjectSchema,
		form: FormSchema,
	})
	.generateMock((base) => ({
		...base,
		type: "AlterForm",
		introductionPanel: {
			title: faker.helpers.arrayElement(["Person Per-Alter Form", "People in Your Network"]),
			text: "On the next screen, you will be asked some questions about each person in your network.",
		},
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

export const alterEdgeFormStage = baseStageSchema
	.extend({
		type: z.literal("AlterEdgeForm"),
		subject: EdgeStageSubjectSchema,
		form: FormSchema,
	})
	.generateMock((base) => ({
		...base,
		type: "AlterEdgeForm",
		introductionPanel: {
			title: faker.helpers.arrayElement(["About This Relationship", "Relationship Details", "Connection Information"]),
			text: "On the next screen, you will be asked some questions about the relationship between pairs of people in your network.",
		},
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
