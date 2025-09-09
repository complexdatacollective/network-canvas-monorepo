import { z } from "zod";

// Type definitions for the mock generator extension
type MockGenerator<T> = () => T;
type ObjectMockGenerator<T> = (data: T) => T;

// Helper type to extract the output type of a Zod schema for use in type annotations
export type MockData<T extends z.ZodTypeAny> = z.output<T>;

// Create an intersection type that preserves the original schema type
type WithMockGenerator<T extends z.ZodTypeAny, U = z.output<T>> = T & {
	_mockGenerator?: MockGenerator<U> | ObjectMockGenerator<U>;
	generateMock(): U;
	generateMock<V = U>(generator: MockGenerator<V> | ObjectMockGenerator<V>): WithMockGenerator<T, V>;
};

declare module "zod" {
	interface ZodType {
		generateMock(): z.output<this>;
		generateMock<T extends z.output<this> = z.output<this>>(
			generator: (() => T) | ((data: z.output<this>) => T),
		): WithMockGenerator<this, T>;
	}
}

// Default mock generators for primitive types
const defaultGenerators = {
	string: () => `mock_string_${Math.random().toString(36).substring(2, 10)}`,
	number: () => Math.floor(Math.random() * 100),
	boolean: () => Math.random() > 0.5,
	date: () => new Date(),
	uuid: () => crypto.randomUUID(),
};

// Helper function to generate mock data for any schema
function generateMockData(schema: z.ZodTypeAny, applyTopLevelTransform = false): any {
	// Check if schema has a custom mock generator (for non-object types or when not applying top-level transform)
	if ((schema as any)._mockGenerator && (!applyTopLevelTransform || (schema as any)._def.type !== "object")) {
		return (schema as any)._mockGenerator();
	}

	const type = (schema as any)._def.type;

	switch (type) {
		case "string": {
			// Check for specific string formats using Zod v4 structure
			const def = (schema as any)._def;

			// Check if it's a UUID by looking for format or validation patterns
			if (def.format === "uuid" || (def.minLength === 36 && def.maxLength === 36)) {
				return defaultGenerators.uuid();
			}

			// Check if it's an email by looking at format
			if (def.format === "email") {
				return `test${Date.now()}@example.com`;
			}

			return defaultGenerators.string();
		}

		case "number":
			return defaultGenerators.number();

		case "boolean":
			return defaultGenerators.boolean();

		case "date":
			return defaultGenerators.date();

		case "object": {
			const shape = (schema as any)._def.shape;
			const result: Record<string, any> = {};

			// Generate mock data for each property
			for (const key in shape) {
				result[key] = generateMockData(shape[key]);
			}

			// Apply object-level transformation if it exists and we're at top level
			if (applyTopLevelTransform && (schema as any)._mockGenerator) {
				const generator = (schema as any)._mockGenerator;
				// Check if the generator expects parameters (object-level transform)
				if (generator.length > 0) {
					return generator(result);
				}
				return generator();
			}

			return result;
		}

		case "array": {
			const elementSchema = (schema as any)._def.element;

			// Handle array constraints - in Zod v4 these are in checks array
			let minLength = 1;
			let maxLength = 3;

			const def = (schema as any)._def;
			if (def.checks && Array.isArray(def.checks)) {
				for (const check of def.checks) {
					// In Zod v4, the values are stored in check._zod.def
					if (check._zod?.def) {
						const checkDef = check._zod.def;
						if (checkDef.check === "min_length" && checkDef.minimum !== undefined) {
							minLength = checkDef.minimum;
						} else if (checkDef.check === "max_length" && checkDef.maximum !== undefined) {
							maxLength = checkDef.maximum;
						}
					}
				}
			}

			const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
			return Array.from({ length }, () => generateMockData(elementSchema));
		}

		case "union": {
			const options = (schema as any)._def.options;
			const randomIndex = Math.floor(Math.random() * options.length);
			return generateMockData(options[randomIndex]);
		}

		case "optional": {
			const innerType = (schema as any)._def.innerType;
			// 70% chance to include optional fields
			if (Math.random() > 0.3) {
				return generateMockData(innerType);
			}
			return undefined;
		}

		case "default": {
			const innerType = (schema as any)._def.innerType;
			// If there's a custom generator, use it; otherwise generate for inner type
			if ((schema as any)._mockGenerator) {
				return (schema as any)._mockGenerator();
			}
			return generateMockData(innerType);
		}

		case "nullable": {
			const innerType = (schema as any)._def.innerType;
			// 80% chance to include nullable fields as non-null
			if (Math.random() > 0.2) {
				return generateMockData(innerType);
			}
			return null;
		}

		case "literal": {
			const values = (schema as any)._def.values;
			if (Array.isArray(values) && values.length > 0) {
				return values[0];
			}
			return undefined;
		}

		case "enum": {
			const entries = (schema as any)._def.entries;
			if (entries && typeof entries === "object") {
				const values = Object.values(entries);
				if (values.length > 0) {
					const randomIndex = Math.floor(Math.random() * values.length);
					return values[randomIndex];
				}
			}
			return undefined;
		}

		case "record": {
			const keyType = (schema as any)._def.keyType;
			const valueType = (schema as any)._def.valueType;

			// Generate random keys and values
			const numEntries = Math.floor(Math.random() * 3) + 2;
			const result: Record<string, any> = {};

			for (let i = 0; i < numEntries; i++) {
				// Generate key - if keyType is string, create a UUID, otherwise use keyType mock
				let key: string;
				if (keyType._def.type === "string") {
					key = crypto.randomUUID();
				} else {
					key = String(generateMockData(keyType, false));
				}

				// Generate value using the value schema
				const value = generateMockData(valueType, false);
				result[key] = value;
			}

			return result;
		}

		case "tuple": {
			const items = (schema as any)._def.items;
			const result: any[] = [];

			for (const itemSchema of items) {
				result.push(generateMockData(itemSchema));
			}

			return result;
		}

		default:
			throw new Error(
				`Mock generation not implemented for type: ${type}. Available: ${JSON.stringify((schema as any)._def, null, 2)}`,
			);
	}
}

// Extend ZodType prototype
z.ZodType.prototype.generateMock = function <T>(generator?: MockGenerator<T>) {
	if (generator) {
		// Store the generator function on the schema instance
		const newSchema = this.clone();
		(newSchema as any)._mockGenerator = generator;
		return newSchema;
	}

	// Called without arguments - generate the mock data
	const type = (this as any)._def.type;

	// For non-object types with custom generators, call the generator directly
	if ((this as any)._mockGenerator && type !== "object") {
		return (this as any)._mockGenerator();
	}

	// For object types, we need to pass the flag to handle object-level transformations
	if (type === "object") {
		return generateMockData(this, true);
	}

	// For other types, generate normally
	return generateMockData(this);
};

export { z };
