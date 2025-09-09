import { faker } from "@faker-js/faker";
import { z } from "src/utils/zod-mock-extension";
import { randomVariable } from "../../../utils/mock-ids";

export const validations = {
	required: z.boolean().optional(),
	requiredAcceptsNull: z.boolean().optional(),
	minLength: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int(5)),
	maxLength: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int(200)),
	minValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int(10)),
	maxValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int({ min: 10, max: 100 })),
	minSelected: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int(2)),
	maxSelected: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.number.int({ min: 2, max: 10 })),
	unique: z.boolean().optional(),
	differentFrom: z
		.string()
		.generateMock(() => randomVariable())
		.optional(),
	sameAs: z
		.string()
		.generateMock(() => randomVariable())
		.optional(),
	greaterThanVariable: z
		.string()
		.generateMock(() => randomVariable())
		.optional(),
	lessThanVariable: z
		.string()
		.generateMock(() => randomVariable())
		.optional(),
};

export const ValidationsSchema = z.object(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

export type ValidationName = keyof Validation;
