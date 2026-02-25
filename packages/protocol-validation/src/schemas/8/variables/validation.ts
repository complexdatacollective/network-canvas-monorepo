import { faker } from "@faker-js/faker";
import { z } from "~/utils/zod-mock-extension";

export const validations = {
	required: z.boolean().optional(),
	requiredAcceptsNull: z.boolean().optional(),
	minLength: z
		.number()
		.int()
		.optional()
		.generateMock(() => (Math.random() < 0.2 ? faker.number.int({ min: 2, max: 5 }) : undefined)),

	maxLength: z
		.number()
		.int()
		.optional()
		.generateMock(() => (Math.random() < 0.2 ? faker.number.int({ min: 6, max: 50 }) : undefined)),
	minValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => (Math.random() < 0.2 ? faker.number.int({ min: 1, max: 10 }) : undefined)),
	maxValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => (Math.random() < 0.2 ? faker.number.int({ min: 11, max: 100 }) : undefined)),
	minSelected: z
		.number()
		.int()
		.optional()
		.generateMock(() => (Math.random() < 0.2 ? faker.number.int({ min: 1, max: 2 }) : undefined)),
	maxSelected: z
		.number()
		.int()
		.optional()
		.generateMock(() => (Math.random() < 0.2 ? faker.number.int({ min: 3, max: 5 }) : undefined)),
	unique: z.boolean().optional(),
	differentFrom: z.string().optional(),
	sameAs: z.string().optional(),
	greaterThanVariable: z.string().optional(),
	lessThanVariable: z.string().optional(),
	greaterThanOrEqualToVariable: z.string().optional(),
	lessThanOrEqualToVariable: z.string().optional(),
};

export const ValidationsSchema = z.object(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

export type ValidationName = keyof Validation;
