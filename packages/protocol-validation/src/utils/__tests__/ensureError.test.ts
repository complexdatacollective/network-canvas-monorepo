import { describe, expect, it } from "vitest";
import { ensureError } from "../ensureError";

describe("ensureError", () => {
	it("should return the error if value is already an Error instance", () => {
		const error = new Error("Test error");
		const result = ensureError(error);
		expect(result).toBe(error);
		expect(result.message).toBe("Test error");
	});

	it("should return a default error when no value is thrown", () => {
		const result = ensureError(null);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("No value was thrown");
	});

	it("should return a default error when undefined is thrown", () => {
		const result = ensureError(undefined);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("No value was thrown");
	});

	it("should wrap a string in an Error", () => {
		const result = ensureError("Something went wrong");
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain('"Something went wrong"');
	});

	it("should wrap a number in an Error", () => {
		const result = ensureError(42);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain("42");
	});

	it("should wrap an object in an Error with stringified value", () => {
		const obj = { code: "ERR_001", details: "Something failed" };
		const result = ensureError(obj);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain(JSON.stringify(obj));
	});

	it("should wrap an array in an Error with stringified value", () => {
		const arr = ["error1", "error2"];
		const result = ensureError(arr);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain(JSON.stringify(arr));
	});

	it("should handle circular references gracefully", () => {
		const circular: { prop?: unknown } = {};
		circular.prop = circular;

		const result = ensureError(circular);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toMatch(
			/^This value was thrown as is, not through an Error: \[Unable to stringify the thrown value\]$/
		);
	});

	it("should handle custom error classes that inherit from Error", () => {
		class CustomError extends Error {
			code: string;
			constructor(message: string, code: string) {
				super(message);
				this.code = code;
				this.name = "CustomError";
			}
		}

		const customError = new CustomError("Custom error message", "CUSTOM_001");
		const result = ensureError(customError);
		expect(result).toBe(customError);
		expect(result.message).toBe("Custom error message");
	});

	it("should handle boolean values", () => {
		const result = ensureError(true);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain("true");
	});

	it("should handle empty string", () => {
		const result = ensureError("");
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("No value was thrown");
	});

	it("should handle zero as a value", () => {
		const result = ensureError(0);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("No value was thrown");
	});

	it("should handle false as a value", () => {
		const result = ensureError(false);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("No value was thrown");
	});

	it("should handle NaN", () => {
		const result = ensureError(Number.NaN);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe("No value was thrown");
	});

	it("should handle symbols", () => {
		const sym = Symbol("test");
		const result = ensureError(sym);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		// Symbols cannot be stringified with JSON.stringify - returns undefined
		// The exact message depends on whether JSON.stringify throws or returns undefined
	});

	it("should handle complex nested objects", () => {
		const complexObj = {
			level1: {
				level2: {
					level3: {
						value: "deep",
					},
				},
			},
			array: [1, 2, 3],
		};

		const result = ensureError(complexObj);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain(JSON.stringify(complexObj));
	});

	it("should preserve error properties", () => {
		const error = new Error("Original message");
		error.stack = "Custom stack trace";
		const result = ensureError(error);
		expect(result.stack).toBe("Custom stack trace");
	});

	it("should handle Error subclass instances", () => {
		const typeError = new TypeError("Type error occurred");
		const result = ensureError(typeError);
		expect(result).toBe(typeError);
		expect(result.message).toBe("Type error occurred");
		expect(result).toBeInstanceOf(TypeError);
	});

	it("should handle RangeError instances", () => {
		const rangeError = new RangeError("Range exceeded");
		const result = ensureError(rangeError);
		expect(result).toBe(rangeError);
		expect(result).toBeInstanceOf(RangeError);
	});

	it("should handle dates", () => {
		const date = new Date("2024-01-01");
		const result = ensureError(date);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
		expect(result.message).toContain(JSON.stringify(date));
	});

	it("should handle RegExp", () => {
		const regex = /test/g;
		const result = ensureError(regex);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toContain("This value was thrown as is, not through an Error");
	});
});
