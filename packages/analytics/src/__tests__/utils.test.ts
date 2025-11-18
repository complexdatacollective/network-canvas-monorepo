import { describe, expect, it, vi } from "vitest";
import { ensureError } from "../utils";

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

		// Mock console.error to avoid test output pollution
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = ensureError(circular);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe(
			"This value was thrown as is, not through an Error: [Unable to stringify the thrown value]",
		);
		expect(consoleErrorSpy).toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
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
});
