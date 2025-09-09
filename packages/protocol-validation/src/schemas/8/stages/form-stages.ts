import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { FormSchema } from "../common";
import { baseStageSchema } from "./base";

const NodeStageSubjectSchema = z
	.object({
		entity: z.literal("node"),
		type: z.string().generateMock(() => crypto.randomUUID()),
	})
	.strict();

const EdgeStageSubjectSchema = z
	.object({
		entity: z.literal("edge"),
		type: z.string().generateMock(() => crypto.randomUUID()),
	})
	.strict();

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
				{ variable: crypto.randomUUID(), prompt: "What is your first name?" },
				{ variable: crypto.randomUUID(), prompt: "What is your age?" },
				{ variable: crypto.randomUUID(), prompt: "What is your date of birth?" },
			],
		},
	}));

export const alterFormStage = baseStageSchema
	.extend({
		type: z.literal("AlterForm"),
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
					variable: crypto.randomUUID(),
					prompt: faker.helpers.arrayElement(["How old is this person?", "What is their age?", "Age of this person?"]),
				},
				{
					variable: crypto.randomUUID(),
					prompt: faker.helpers.arrayElement([
						"What is their occupation?",
						"What do they do for work?",
						"Their job or profession?",
					]),
				},
				{
					variable: crypto.randomUUID(),
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
					variable: crypto.randomUUID(),
					prompt: faker.helpers.arrayElement([
						"How strong is this relationship?",
						"Rate the strength of this connection",
						"How close are they?",
					]),
				},
				{
					variable: crypto.randomUUID(),
					prompt: faker.helpers.arrayElement([
						"How often do they interact?",
						"Frequency of contact",
						"How often do they communicate?",
					]),
				},
				{
					variable: crypto.randomUUID(),
					prompt: faker.helpers.arrayElement([
						"What type of relationship is this?",
						"How would you describe this relationship?",
						"Nature of their connection?",
					]),
				},
			],
		},
	}));
