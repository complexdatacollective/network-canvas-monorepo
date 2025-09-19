import { describe, expect, it } from "vitest";
import { z } from "../zod-mock-extension";

// Note: These tests will fail until the generateMock extension is implemented
describe("Zod Mock Generator", () => {
	describe("simple string schema", () => {
		it("should generate mock data for string with custom generator", () => {
			const name = z.string().generateMock(() => "Jim");

			expect(name.generateMock()).toBe("Jim");
		});
	});

	describe("object schema with property-level mocks", () => {
		it("should generate mock data for object with property-level generators", () => {
			const userSchema = z.object({
				username: z
					.string()
					.min(1)
					.generateMock(() => `User_${Math.random().toString(36).substr(2, 9)}`),
				password: z
					.string()
					.min(8)
					.generateMock(() => "password123"),
			});

			const result = userSchema.generateMock();

			expect(result).toHaveProperty("username");
			expect(result).toHaveProperty("password");
			expect(result.username).toMatch(/^User_[a-z0-9]{9}$/);
			expect(result.password).toBe("password123");
			expect(typeof result.username).toBe("string");
			expect(typeof result.password).toBe("string");
		});
	});

	describe("nested object schema with object-level transformation", () => {
		it("should handle nested schemas with object-level mock transformation", () => {
			const userSchema = z.object({
				id: z.uuid().generateMock(() => crypto.randomUUID()),
				username: z
					.string()
					.min(1)
					.generateMock(() => `User_${Math.random().toString(36).substr(2, 9)}`),
				password: z
					.string()
					.min(8)
					.generateMock(() => "password123"),
			});

			const cartSchema = z
				.object({
					id: z.uuid().generateMock(() => crypto.randomUUID()),
					user: userSchema,
					items: z
						.array(
							z.object({
								productId: z.uuid().generateMock(() => crypto.randomUUID()),
								quantity: z
									.number()
									.min(1)
									.default(1)
									.generateMock(() => 1),
							}),
						)
						.min(1),
				})
				.generateMock(({ id, user, items }: any) => ({
					id,
					user,
					items: items.map((item: any) => ({
						productId: `${user.id}_${item.productId}`,
						quantity: item.quantity,
					})),
				}));

			const result = cartSchema.generateMock();

			expect(result).toHaveProperty("id");
			expect(result).toHaveProperty("user");
			expect(result).toHaveProperty("items");
			expect(Array.isArray(result.items)).toBe(true);
			expect(result.items.length).toBeGreaterThan(0);

			// Check user structure
			expect(result.user).toHaveProperty("id");
			expect(result.user).toHaveProperty("username");
			expect(result.user).toHaveProperty("password");

			// Check items structure and transformation
			for (const item of result.items) {
				expect(item).toHaveProperty("productId");
				expect(item).toHaveProperty("quantity");
				expect(item.productId).toMatch(new RegExp(`^${result.user.id}_[a-f0-9-]{36}$`));
				expect(typeof item.quantity).toBe("number");
			}
		});
	});

	describe("type safety", () => {
		it("should enforce type safety for mock functions", () => {
			// This test documents the expected TypeScript behavior
			// The mock function parameter should be inferred as the schema's output type
			const validSchema = z
				.object({
					id: z.uuid(),
					name: z.string().min(1),
					age: z.number().int().positive(),
					email: z.email(),
					createdAt: z.date(),
				})
				.generateMock(() => ({
					id: crypto.randomUUID(),
					name: `User_${Math.random().toString(36).substr(2, 9)}`,
					age: Math.floor(Math.random() * 50) + 18,
					email: `test${Date.now()}@example.com`,
					createdAt: new Date(),
				}));

			const result = validSchema.generateMock();

			expect(result).toHaveProperty("id");
			expect(result).toHaveProperty("name");
			expect(result).toHaveProperty("age");
			expect(result).toHaveProperty("email");
			expect(result).toHaveProperty("createdAt");
			expect(typeof result.id).toBe("string");
			expect(typeof result.name).toBe("string");
			expect(typeof result.age).toBe("number");
			expect(typeof result.email).toBe("string");
			expect(result.createdAt instanceof Date).toBe(true);
		});
	});

	describe("schema composition", () => {
		it("should work with union schemas", () => {
			const birdSchema = z
				.object({
					id: z.uuid(),
					name: z.string().min(1),
					age: z.number().min(0).optional(),
					email: z.email(),
					createdAt: z.date(),
				})
				.generateMock(() => ({
					id: crypto.randomUUID(),
					name: `Bird_${Math.random().toString(36).substr(2, 9)}`,
					age: Math.floor(Math.random() * 50) + 1,
					email: `bird${Date.now()}@example.com`,
					createdAt: new Date(),
				}));

			const mammalSchema = z
				.object({
					id: z.uuid(),
					name: z.string().min(1),
					age: z.number().min(0).optional(),
					email: z.email(),
					createdAt: z.date(),
				})
				.generateMock(() => ({
					id: crypto.randomUUID(),
					name: `Mammal_${Math.random().toString(36).substr(2, 9)}`,
					age: Math.floor(Math.random() * 50) + 1,
					email: `mammal${Date.now()}@example.com`,
					createdAt: new Date(),
				}));

			const animalSchema = z.union([birdSchema, mammalSchema]);

			// Union schemas should be able to generate mocks from either branch
			const result = animalSchema.generateMock();

			expect(result).toHaveProperty("id");
			expect(result).toHaveProperty("name");
			expect(result).toHaveProperty("email");
			expect(result).toHaveProperty("createdAt");
			expect(typeof result.id).toBe("string");
			expect(typeof result.name).toBe("string");
			expect(typeof result.email).toBe("string");
			expect(result.createdAt instanceof Date).toBe(true);
			expect(result.name.startsWith("Bird_") || result.name.startsWith("Mammal_")).toBe(true);
		});
	});

	describe("array handling", () => {
		it("should generate mock data for array schemas", () => {
			const itemSchema = z.object({
				productId: z.uuid().generateMock(() => crypto.randomUUID()),
				quantity: z
					.number()
					.min(1)
					.generateMock(() => 5),
			});

			const arraySchema = z.array(itemSchema).min(2).max(3);

			const result = arraySchema.generateMock();

			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThanOrEqual(2);
			expect(result.length).toBeLessThanOrEqual(3);

			for (const item of result) {
				expect(item).toHaveProperty("productId");
				expect(item).toHaveProperty("quantity");
				expect(typeof item.productId).toBe("string");
				expect(item.quantity).toBe(5);
			}
		});
	});

	describe("optional and default values", () => {
		it("should handle optional fields and defaults", () => {
			const schema = z.object({
				required: z.string().generateMock(() => "required"),
				optional: z.string().optional(),
				withDefault: z
					.string()
					.default("default")
					.generateMock(() => "custom"),
			});

			const result = schema.generateMock();

			expect(result.required).toBe("required");
			expect(result.withDefault).toBe("custom");
			// Optional field behavior will depend on implementation
		});
	});

	describe("literal and enum support", () => {
		it("should generate exact literal values", () => {
			const literalSchema = z.literal("exact_value");
			const numberLiteralSchema = z.literal(42);
			const booleanLiteralSchema = z.literal(true);

			expect(literalSchema.generateMock()).toBe("exact_value");
			expect(numberLiteralSchema.generateMock()).toBe(42);
			expect(booleanLiteralSchema.generateMock()).toBe(true);
		});

		it("should generate random enum values", () => {
			const enumSchema = z.enum(["option1", "option2", "option3"]);

			const result = enumSchema.generateMock();
			expect(["option1", "option2", "option3"]).toContain(result);
		});

		it("should work with protocol schema enums and literals", () => {
			const entitySchema = z.literal("node");
			const typeSchema = z.enum(["text", "number", "boolean"]);
			const operatorSchema = z.enum(["EXISTS", "NOT_EXISTS", "EXACTLY"]);

			expect(entitySchema.generateMock()).toBe("node");
			expect(["text", "number", "boolean"]).toContain(typeSchema.generateMock());
			expect(["EXISTS", "NOT_EXISTS", "EXACTLY"]).toContain(operatorSchema.generateMock());
		});
	});
});
