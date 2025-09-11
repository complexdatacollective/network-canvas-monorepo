import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";

export const validations = {
	required: z.boolean().optional(),
	requiredAcceptsNull: z.boolean().optional(),
	minLength: z
		.number()
		.int()
		.generateMock(() => faker.number.int({ min: 2, max: 5 }))
		.optional(),

	maxLength: z
		.number()
		.int()
		.generateMock(() => faker.number.int({ min: 6, max: 50 }))
		.optional(),
	minValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int({ min: 1, max: 10 })),
	maxValue: z
		.number()
		.int()
		.generateMock(() => faker.number.int({ min: 11, max: 100 }))
		.optional(),
	minSelected: z
		.number()
		.int()
		.generateMock(() => faker.number.int({ min: 1, max: 2 }))
		.optional(),
	maxSelected: z
		.number()
		.int()
		.generateMock(() => faker.number.int({ min: 3, max: 5 }))
		.optional(),
	unique: z.boolean().optional(),
	differentFrom: z.string().optional(),
	sameAs: z.string().optional(),
	greaterThanVariable: z.string().optional(),
	lessThanVariable: z.string().optional(),
};

export const ValidationsSchema = z.object(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

export type ValidationName = keyof Validation;
