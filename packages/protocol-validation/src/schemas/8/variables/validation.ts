import { z } from "zod";

export const validations = {
	required: z.boolean().optional(),
	requiredAcceptsNull: z.boolean().optional(),
	minLength: z.number().int().optional(),
	maxLength: z.number().int().optional(),
	minValue: z.number().int().optional(),
	maxValue: z.number().int().optional(),
	minSelected: z.number().int().optional(),
	maxSelected: z.number().int().optional(),
	unique: z.boolean().optional(),
	differentFrom: z.string().optional(),
	sameAs: z.string().optional(),
	greaterThanVariable: z.string().optional(),
	lessThanVariable: z.string().optional(),
};

export const ValidationsSchema = z.object(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

export type ValidationName = keyof Validation;
