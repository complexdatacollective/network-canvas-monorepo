import { VariableNameSchema } from "@codaco/shared-consts";
import { faker } from "@faker-js/faker";
import { getEdgeVariableId, getEgoVariableId, getNodeVariableId } from "~/utils/mock-seeds";
import { findDuplicateName, getVariableNames } from "~/utils/validation-helpers";
import { z } from "~/utils/zod-mock-extension";
import { ComponentTypes, VariableTypes } from "./types";
import { validations } from "./validation";

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

// Options Schema for categorical and ordinal variables
const categoricalOptionsSchema = z.array(
	z
		.object({
			label: z.string(),
			value: z.union([z.number().int(), z.string(), z.boolean()]),
		})
		.strict(),
);

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

const variableSchemas = [
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
] as const;
export const VariableSchema = z.union([...variableSchemas]);

// Ego variables cannot use 'unique' validation
const omitUnique = <T extends z.ZodObject>(schema: T) => {
	schema.extend({
		validation: schema.shape.validation?.unwrap().omit({ unique: true }).optional(),
	});
	return schema;
};
const EgoVariableSchema = z.union([
	omitUnique(textVariableSchema),
	omitUnique(numberVariableSchema),
	scalarVariableSchema,
	omitUnique(booleanBooleanVariableSchema),
	omitUnique(booleanToggleVariableSchema),
	omitUnique(ordinalVariableSchema),
	omitUnique(categoricalVariableSchema),
	omitUnique(dateTimeDatePickerSchema),
	omitUnique(dateTimeRelativeDatePickerSchema),
	layoutVariableSchema,
	locationVariableSchema,
]);

export type Variable = z.infer<typeof VariableSchema>;

type AllKeys<T> = T extends unknown ? keyof T : never;
export type VariablePropertyKey = AllKeys<Variable>;

type AllValues<T> = T extends unknown ? T[keyof T] : never;
export type VariablePropertyValue = AllValues<Variable>;

const checkDuplicateVariableNames = <T extends Record<string, Variable>>(variables: T, ctx: z.RefinementCtx) => {
	const variableNames = getVariableNames(variables);
	const duplicateVarName = findDuplicateName(variableNames);
	if (duplicateVarName) {
		ctx.addIssue({
			code: "custom" as const,
			message: `Duplicate variable name "${duplicateVarName}"`,
			path: [],
		});
	}
};
export const VariablesSchema = z
	.record(VariableNameSchema, VariableSchema)
	.superRefine(checkDuplicateVariableNames)
	.generateMock(() => generateVariableMocks("node"));

export const EdgeVariablesSchema = z
	.record(VariableNameSchema, VariableSchema)
	.superRefine(checkDuplicateVariableNames)
	.generateMock(() => generateVariableMocks("edge"));

export const EgoVariablesSchema = z
	.record(VariableNameSchema, EgoVariableSchema)
	.superRefine(checkDuplicateVariableNames)
	.generateMock(() => generateVariableMocks("ego"));

export function generateVariableMocks(type: "ego" | "edge" | "node"): Record<string, Variable> {
	const idGenerator = {
		ego: getEgoVariableId,
		edge: getEdgeVariableId,
		node: getNodeVariableId,
	}[type];

	const variableSchema = type === "ego" ? EgoVariableSchema : VariableSchema;
	const randomVariables: Record<string, Variable> = {};

	for (let i = 0; i < 3; i++) {
		const schema = faker.helpers.arrayElement(variableSchema.options);
		const baseMock = schema.generateMock();
		console.log(baseMock);

		// Validations should only be present 20% of the time
		// Remove them 80%

		if (!("validation" in baseMock)) {
			randomVariables[idGenerator(i)] = baseMock;
			continue;
		}

		if (Math.random() < 0.2) {
			randomVariables[idGenerator(i)] = {
				...baseMock,
				validation: undefined,
			};
			continue;
		}

		/*
		 Some validations reference other variables by ID 
		 (differentFrom, sameAs, greaterThanVariable, lessThanVariable)

		 We need to ensure these references are entity-specific and do not self-reference
		 e.g., a node variable cannot reference an ego or edge variable
		 e.g., a variable cannot reference itself

		 This has to be done post-validation generation, as the validation mock generators are not context-aware
		*/

		const entityAwareValidation = { ...baseMock.validation };
		const refIndex = (i + 1) % 3;

		if ("differentFrom" in entityAwareValidation) {
			entityAwareValidation.differentFrom = idGenerator(refIndex);
		}
		if ("sameAs" in entityAwareValidation) {
			entityAwareValidation.sameAs = idGenerator(refIndex);
		}
		if ("greaterThanVariable" in entityAwareValidation) {
			entityAwareValidation.greaterThanVariable = idGenerator(refIndex);
		}
		if ("lessThanVariable" in entityAwareValidation) {
			entityAwareValidation.lessThanVariable = idGenerator(refIndex);
		}

		randomVariables[idGenerator(i)] = {
			...baseMock,
			validation: entityAwareValidation,
		};
	}

	return randomVariables;
}
export type Variables = z.infer<typeof VariablesSchema>;
