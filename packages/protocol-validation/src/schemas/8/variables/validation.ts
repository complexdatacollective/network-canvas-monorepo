import { faker } from "@faker-js/faker";
import { getNodeVariableId } from "src/utils/mock-seeds";
import { z } from "src/utils/zod-mock-extension";

export const validations = {
	required: z.boolean().optional(),
	requiredAcceptsNull: z.boolean().optional(),
	minLength: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.helpers.arrayElement([1, 2, 3, 5])),
	maxLength: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.helpers.arrayElement([50, 100, 200])),
	minValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.helpers.arrayElement([0, 1, 5, 10])),
	maxValue: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.helpers.arrayElement([10, 50, 100])),
	minSelected: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.helpers.arrayElement([1, 2])),
	maxSelected: z
		.number()
		.int()
		.optional()
		.generateMock(() => faker.helpers.arrayElement([3, 5, 10])),
	unique: z.boolean().optional(),
	differentFrom: z
		.string()
		.generateMock(() => getNodeVariableId(1))
		.optional(),
	sameAs: z
		.string()
		.generateMock(() => getNodeVariableId(1))
		.optional(),
	greaterThanVariable: z
		.string()
		.generateMock(() => getNodeVariableId(1))
		.optional(),
	lessThanVariable: z
		.string()
		.generateMock(() => getNodeVariableId(1))
		.optional(),
};

export const ValidationsSchema = z.object(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

export type ValidationName = keyof Validation;
