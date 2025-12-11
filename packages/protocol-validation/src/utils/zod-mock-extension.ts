import { z } from "zod";
import type * as core from "zod/v4/core";

// Symbol key for storing mock generators - avoids property collision
const MOCK_GENERATOR = Symbol.for("zod-mock-generator");

// Type for schemas with attached mock generators
type SchemaWithMockGenerator<S extends z.ZodType> = S & {
	[MOCK_GENERATOR]?: (data: z.output<S>) => z.output<S>;
};

// Detects if T is a union type (distributes to multiple types)
type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : false;

// Helper to detect if a type is a simple plain object suitable for excess property checking
type CanCheckExcess<T> = [T] extends [object]
	? [T] extends [readonly unknown[] | ((...args: unknown[]) => unknown)]
		? false
		: [string] extends [keyof T]
			? false // Has index signature like Record<string, T>
			: [IsUnion<T>] extends [true]
				? false // Is a union type
				: true
	: false;

// Forces excess property checking by requiring any extra keys to be `never`
// Only applies to simple non-union object types - primitives, unions, records pass through
type ExactReturn<T, Expected> = [CanCheckExcess<Expected>] extends [true]
	? [CanCheckExcess<T>] extends [true]
		? T & Record<Exclude<keyof T, keyof Expected>, never>
		: T
	: T;

declare module "zod" {
	// biome-ignore lint/style/useConsistentTypeDefinitions: needs to extend interface
	interface ZodType {
		generateMock(): z.output<this>;
		generateMock<T extends z.output<this>>(generator: (data: z.output<this>) => ExactReturn<T, z.output<this>>): this;
		generateMock<T extends z.output<this>>(generator: () => ExactReturn<T, z.output<this>>): this;
	}
}

// Default mock generators for primitive types
const defaultGenerators = {
	string: () => `mock_string_${Math.random().toString(36).substring(2, 10)}`,
	number: () => Math.floor(Math.random() * 100),
	boolean: () => Math.random() > 0.5,
	date: () => new Date(),
	uuid: () => crypto.randomUUID(),
	email: () => `test${Date.now()}@example.com`,
};

// Helper to get mock generator from schema
function getMockGenerator<S extends z.ZodType>(schema: S): ((data: z.output<S>) => z.output<S>) | undefined {
	return (schema as SchemaWithMockGenerator<S>)[MOCK_GENERATOR];
}

// Helper to set mock generator on schema
function setMockGenerator<S extends z.ZodType>(schema: S, generator: (data: z.output<S>) => z.output<S>): void {
	(schema as SchemaWithMockGenerator<S>)[MOCK_GENERATOR] = generator;
}

// Helper to detect string format from checks
function getStringFormat(def: core.$ZodStringDef): string | null {
	if (!def.checks) return null;
	for (const check of def.checks) {
		const checkDef = (check as core.$ZodCheck)._zod.def;
		if (checkDef.check === "string_format" && "format" in checkDef) {
			return checkDef.format as string;
		}
	}
	return null;
}

// Type-safe helper to generate mock data using Zod v4's _zod internals
function generateMockData<S extends z.ZodType>(schema: S, applyTopLevelTransform = false): z.output<S> {
	const def = schema._zod.def;
	const mockGenerator = getMockGenerator(schema);

	// Check if schema has a custom mock generator (for non-object types or when not applying top-level transform)
	if (mockGenerator && (!applyTopLevelTransform || def.type !== "object")) {
		return mockGenerator(undefined as z.output<S>);
	}

	switch (def.type) {
		case "string": {
			// Check for specific string formats (uuid, email, etc.)
			const format = getStringFormat(def as core.$ZodStringDef);
			if (format === "uuid") {
				return defaultGenerators.uuid() as z.output<S>;
			}
			if (format === "email") {
				return defaultGenerators.email() as z.output<S>;
			}
			return defaultGenerators.string() as z.output<S>;
		}

		case "number":
		case "int": {
			return defaultGenerators.number() as z.output<S>;
		}

		case "boolean": {
			return defaultGenerators.boolean() as z.output<S>;
		}

		case "date": {
			return defaultGenerators.date() as z.output<S>;
		}

		case "object": {
			const objectDef = def as core.$ZodObjectDef;
			const result: Record<string, unknown> = {};

			// Generate mock data for each property in the shape
			for (const key in objectDef.shape) {
				result[key] = generateMockData(objectDef.shape[key] as z.ZodType);
			}

			// Apply object-level transformation if it exists and we're at top level
			if (applyTopLevelTransform && mockGenerator) {
				return mockGenerator(result as z.output<S>);
			}

			return result as z.output<S>;
		}

		case "array": {
			const arrayDef = def as core.$ZodArrayDef;
			const elementSchema = arrayDef.element as z.ZodType;

			// Handle array constraints from checks
			let minLength = 1;
			let maxLength = 3;

			if (arrayDef.checks) {
				for (const check of arrayDef.checks) {
					const checkDef = (check as core.$ZodCheck)._zod.def;
					if (checkDef.check === "min_length" && "minimum" in checkDef) {
						minLength = checkDef.minimum as number;
					} else if (checkDef.check === "max_length" && "maximum" in checkDef) {
						maxLength = checkDef.maximum as number;
					}
				}
			}

			const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
			return Array.from({ length }, () => generateMockData(elementSchema)) as z.output<S>;
		}

		case "union": {
			const unionDef = def as core.$ZodUnionDef;
			const options = unionDef.options as z.ZodType[];
			const randomIndex = Math.floor(Math.random() * options.length);
			const selectedOption = options[randomIndex];
			if (!selectedOption) {
				throw new Error("Union has no options");
			}
			return generateMockData(selectedOption) as z.output<S>;
		}

		case "optional": {
			const optionalDef = def as core.$ZodOptionalDef;
			const innerSchema = optionalDef.innerType as z.ZodType;
			// 70% chance to include optional fields
			if (Math.random() > 0.3) {
				return generateMockData(innerSchema) as z.output<S>;
			}
			return undefined as z.output<S>;
		}

		case "default": {
			const defaultDef = def as core.$ZodDefaultDef;
			const innerSchema = defaultDef.innerType as z.ZodType;
			// If there's a custom generator, use it; otherwise generate for inner type
			if (mockGenerator) {
				return mockGenerator(undefined as z.output<S>);
			}
			return generateMockData(innerSchema) as z.output<S>;
		}

		case "nullable": {
			const nullableDef = def as core.$ZodNullableDef;
			const innerSchema = nullableDef.innerType as z.ZodType;
			// 80% chance to include nullable fields as non-null
			if (Math.random() > 0.2) {
				return generateMockData(innerSchema) as z.output<S>;
			}
			return null as z.output<S>;
		}

		case "literal": {
			const literalDef = def as core.$ZodLiteralDef<core.util.Literal>;
			return literalDef.values[0] as z.output<S>;
		}

		case "enum": {
			const enumDef = def as core.$ZodEnumDef;
			const values = Object.values(enumDef.entries);
			return values[Math.floor(Math.random() * values.length)] as z.output<S>;
		}

		case "record": {
			const recordDef = def as core.$ZodRecordDef;
			const keySchema = recordDef.keyType as z.ZodType;
			const valueSchema = recordDef.valueType as z.ZodType;
			const numEntries = Math.floor(Math.random() * 3) + 1;

			return Object.fromEntries(
				Array.from({ length: numEntries }, () => {
					const key = String(generateMockData(keySchema));
					const value = generateMockData(valueSchema);
					return [key, value] as const;
				}),
			) as z.output<S>;
		}

		case "tuple": {
			const tupleDef = def as core.$ZodTupleDef;
			const items = tupleDef.items as z.ZodType[];
			return items.map((itemSchema) => generateMockData(itemSchema)) as z.output<S>;
		}

		default:
			throw new Error(`Mock generation not implemented for type: ${def.type}. Def: ${JSON.stringify(def, null, 2)}`);
	}
}

// Extend ZodType prototype
z.ZodType.prototype.generateMock = function <S extends z.ZodType, T>(
	this: S,
	generator?: (() => T) | ((data: z.output<S>) => T),
): z.output<S> | S {
	if (generator) {
		// Store the generator function on a cloned schema instance
		const newSchema = this.clone();
		setMockGenerator(newSchema, generator as (data: z.output<S>) => z.output<S>);
		return newSchema;
	}

	// Called without arguments - generate the mock data
	const def = this._zod.def;

	// For non-object types with custom generators, call the generator directly
	const mockGenerator = getMockGenerator(this);
	if (mockGenerator && def.type !== "object") {
		return mockGenerator(undefined as z.output<S>);
	}

	// For object types, we need to pass the flag to handle object-level transformations
	if (def.type === "object") {
		return generateMockData(this, true);
	}

	// For other types, generate normally
	return generateMockData(this);
};

export { z };
