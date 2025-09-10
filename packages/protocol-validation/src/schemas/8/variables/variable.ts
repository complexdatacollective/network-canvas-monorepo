import { VariableNameSchema } from "@codaco/shared-consts";
import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "src/utils/mock-seeds";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateName, getVariableNames } from "../../../utils/validation-helpers";
import { ComponentTypes, VariableTypes } from "./types";
import { validations } from "./validation";

// Options Schema for categorical and ordinal variables
const categoricalOptionsSchema = z
	.array(
		z
			.object({
				label: z.string().generateMock(() => `Option ${Math.floor(Math.random() * 100) + 1}`),
				value: z
					.union([z.number().int(), z.string(), z.boolean()])
					.generateMock(() => Math.floor(Math.random() * 5) + 1),
			})
			.strict(),
	)
	.generateMock(() => [
		{ label: faker.word.words(5), value: 1 },
		{ label: faker.word.words(5), value: 2 },
		{ label: faker.word.words(5), value: 3 },
	]);

export type VariableOptions = z.infer<typeof categoricalOptionsSchema>;

// Variable Schema
const baseVariableSchema = z
	.object({
		name: VariableNameSchema.generateMock(() => `variable_${Math.random().toString(36).substring(2, 8)}`),
		encrypted: z
			.boolean()
			.optional()
			.generateMock(() => false),
	})
	.strict();

const numberVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.number),
	component: z.literal(ComponentTypes.Number).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			minValue: true,
			maxValue: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const scalarVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.scalar),
	component: z.literal(ComponentTypes.VisualAnalogScale).optional(),
	parameters: z
		.object({
			minLabel: z.string().optional(),
			maxLabel: z.string().optional(),
		})
		.optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			minValue: true,
			maxValue: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const dateTimeDatePickerSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.datetime),
	component: z.literal(ComponentTypes.DatePicker).optional(),
	parameters: z
		.object({
			type: z.enum(["full", "month", "year"]).optional(),
			min: z.string().optional(),
			max: z.string().optional(),
		})
		.optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const dateTimeRelativeDatePickerSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.datetime),
	component: z.literal(ComponentTypes.RelativeDatePicker).optional(),
	parameters: z
		.object({
			before: z.number().int().optional(),
			after: z.number().int().optional(),
		})
		.optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
			greaterThanVariable: true,
			lessThanVariable: true,
		})
		.optional(),
});

const textVariableSchema = baseVariableSchema
	.extend({
		type: z.literal(VariableTypes.text),
		component: z
			.enum([ComponentTypes.Text, ComponentTypes.TextArea])
			.optional()
			.generateMock(() => ComponentTypes.Text),
		validation: z
			.object(validations)
			.pick({
				required: true,
				minLength: true,
				maxLength: true,
				sameAs: true,
				unique: true,
				differentFrom: true,
			})
			.optional(),
	})
	.generateMock((base) => ({
		...base,
		name: `text_${base.name}`,
	}));

const booleanOptionsSchema = z
	.array(
		z.object({
			label: z.string().generateMock(() => `boolean option ${Math.floor(Math.random() * 100) + 1}`),
			value: z.boolean().generateMock(() => Math.random() > 0.5),
			negative: z
				.boolean()
				.optional()
				.generateMock(() => false),
		}),
	)
	.generateMock(() => [
		{ label: "Yes", value: true },
		{ label: "No", value: false },
	]);

const booleanBooleanVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.boolean),
	component: z.literal(ComponentTypes.Boolean).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
	options: booleanOptionsSchema.optional(), // This is different from the categorical options!
});

const booleanToggleVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.boolean),
	component: z.literal(ComponentTypes.Toggle).optional(),
	validation: z
		.object(validations)
		.pick({
			required: true,
			sameAs: true,
			unique: true,
			differentFrom: true,
		})
		.optional(),
});

const ordinalVariableSchema = baseVariableSchema
	.extend({
		type: z.literal(VariableTypes.ordinal),
		component: z
			.enum([ComponentTypes.RadioGroup, ComponentTypes.LikertScale])
			.optional()
			.generateMock(() => ComponentTypes.RadioGroup),
		options: categoricalOptionsSchema,
		validation: z
			.object(validations)
			.pick({
				required: true,
				minSelected: true,
				maxSelected: true,
				sameAs: true,
				unique: true,
				differentFrom: true,
			})
			.optional(),
	})
	.generateMock((base) => ({
		...base,
		name: `ordinal_${base.name}`,
	}));

const categoricalVariableSchema = baseVariableSchema
	.extend({
		type: z.literal(VariableTypes.categorical),
		component: z
			.enum([ComponentTypes.CheckboxGroup, ComponentTypes.ToggleButtonGroup])
			.optional()
			.generateMock(() => ComponentTypes.CheckboxGroup),
		options: categoricalOptionsSchema,
		validation: z
			.object(validations)
			.pick({
				required: true,
				minSelected: true,
				maxSelected: true,
				sameAs: true,
				unique: true,
				differentFrom: true,
			})
			.optional(),
	})
	.generateMock((base) => ({
		...base,
		name: `categorical_${base.name}`,
	}));

const layoutVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.layout),
});

const locationVariableSchema = baseVariableSchema.extend({
	type: z.literal(VariableTypes.location),
});

export const VariableSchema = z.union([
	textVariableSchema,
	numberVariableSchema,
	scalarVariableSchema,
	booleanBooleanVariableSchema,
	booleanToggleVariableSchema,
	ordinalVariableSchema,
	categoricalVariableSchema,
	dateTimeDatePickerSchema,
	dateTimeRelativeDatePickerSchema,
	layoutVariableSchema,
	locationVariableSchema,
]);

export type Variable = z.infer<typeof VariableSchema>;

type AllKeys<T> = T extends unknown ? keyof T : never;
export type VariablePropertyKey = AllKeys<Variable>;

type AllValues<T> = T extends unknown ? T[keyof T] : never;
export type VariablePropertyValue = AllValues<Variable>;

export const VariablesSchema = z
	.record(VariableNameSchema, VariableSchema)
	.superRefine((variables, ctx) => {
		// Check for duplicate variable names
		const variableNames = getVariableNames(variables);
		const duplicateVarName = findDuplicateName(variableNames);
		if (duplicateVarName) {
			ctx.addIssue({
				code: "custom" as const,
				message: `Duplicate variable name "${duplicateVarName}"`,
				path: [],
			});
		}
	})
	.generateMock(() => {
		const textVar = textVariableSchema.generateMock();
		const ordinalVar = ordinalVariableSchema.generateMock();
		const categoricalVar = categoricalVariableSchema.generateMock();

		const firstName = { ...textVar, name: "name" };
		const communicationFrequency = { ...ordinalVar, name: "communication_freq" };
		const languagesSpoken = { ...categoricalVar, name: "languages_spoken" };

		return {
			[getNodeVariableId(0)]: firstName,
			[getNodeVariableId(1)]: communicationFrequency,
			[getNodeVariableId(2)]: languagesSpoken,
		};
	});

export type Variables = z.infer<typeof VariablesSchema>;
