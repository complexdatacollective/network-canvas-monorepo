import { VariableNameSchema } from "@codaco/shared-consts";
import { getNodeVariableId } from "src/utils/mock-seeds";
import { z } from "src/utils/zod-mock-extension";
import { findDuplicateName, getVariableNames } from "../../../utils/validation-helpers";
import { ComponentTypes, VariableTypes } from "./types";
import { validations } from "./validation";

// Options Schema for categorical and ordinal variables
const categoricalOptionsSchema = z.array(
	z
		.object({
			label: z.string(),
			value: z.union([z.number().int(), z.string(), z.boolean()]),
		})
		.strict(),
);

export type VariableOptions = z.infer<typeof categoricalOptionsSchema>;

// Variable Schema
const baseVariableSchema = z
	.object({
		name: VariableNameSchema,
		encrypted: z.boolean().optional(),
	})
	.strict();

const numberVariableSchema = baseVariableSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		name: `number_${base.name}`,
	}));

const scalarVariableSchema = baseVariableSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		name: `scalar_${base.name}`,
	}));

const dateTimeDatePickerSchema = baseVariableSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		name: `date_time_${base.name}`,
	}));

const dateTimeRelativeDatePickerSchema = baseVariableSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		name: `date_time_relative_${base.name}`,
	}));

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

const booleanBooleanVariableSchema = baseVariableSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		name: `boolean_${base.name}`,
	}));

const booleanToggleVariableSchema = baseVariableSchema
	.extend({
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
	})
	.generateMock((base) => ({
		...base,
		name: `boolean_toggle_${base.name}`,
	}));

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

const layoutVariableSchema = baseVariableSchema
	.extend({
		type: z.literal(VariableTypes.layout),
	})
	.generateMock((base) => ({
		...base,
		name: `layout_${base.name}`,
	}));

const locationVariableSchema = baseVariableSchema
	.extend({
		type: z.literal(VariableTypes.location),
	})
	.generateMock((base) => ({
		...base,
		name: `location_${base.name}`,
	}));

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
		// todo: could be improved by getting random variable types
		const textVar = textVariableSchema.generateMock();
		const ordinalVar = ordinalVariableSchema.generateMock();
		const categoricalVar = categoricalVariableSchema.generateMock();

		return {
			[getNodeVariableId(0)]: textVar,
			[getNodeVariableId(1)]: ordinalVar,
			[getNodeVariableId(2)]: categoricalVar,
		};
	});

export type Variables = z.infer<typeof VariablesSchema>;
