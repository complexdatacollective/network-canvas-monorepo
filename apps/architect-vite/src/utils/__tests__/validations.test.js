import { describe, expect, it } from "vitest";
import { getValidations, validations } from "../validations";

const { greaterThan, maxLength, maxSelected, maxValue, minLength, minSelected, minValue, required } = validations;

describe("Validations", () => {
	describe("required()", () => {
		const errorMessage = "You must answer this question before continuing";
		const subject = required(true, errorMessage);

		it("passes for a string", () => {
			expect(subject("hello world")).toBe(undefined);
		});

		it("passes for a numerical value", () => {
			expect(subject(3)).toBe(undefined);
			expect(subject(0)).toBe(undefined);
		});

		it("fails for null or undefined", () => {
			expect(subject(null)).toEqual(errorMessage);
			expect(subject(undefined)).toEqual(errorMessage);
		});

		it("fails for an empty string", () => {
			expect(subject("")).toEqual(errorMessage);
		});
	});

	describe("minLength()", () => {
		const errorMessage = "Your answer must be 5 characters or more";
		const subject = minLength(5, errorMessage);

		it("fails for null or undefined", () => {
			expect(subject(null)).toBe(errorMessage);
			expect(subject(undefined)).toBe(errorMessage);
		});

		it("fails for a smaller string", () => {
			expect(subject("hi")).toBe(errorMessage);
		});

		it("passes for an exactly matching string", () => {
			expect(subject("hello")).toBe(undefined);
		});

		it("passes for a larger string", () => {
			expect(subject("hello world")).toBe(undefined);
		});
	});

	describe("maxLength()", () => {
		const errorMessage = "Your answer must be 5 characters or less";
		const subject = maxLength(5, errorMessage);

		it("passes for null or undefined", () => {
			expect(subject(null)).toBe(undefined);
			expect(subject(undefined)).toBe(undefined);
		});

		it("passes for a smaller string", () => {
			expect(subject("hi")).toBe(undefined);
		});

		it("passes for an exactly matching string", () => {
			expect(subject("hello")).toBe(undefined);
		});

		it("fails for a larger string", () => {
			expect(subject("hello world")).toBe(errorMessage);
		});
	});

	describe("minValue()", () => {
		const errorMessage = "Your answer must be at least 5";
		const subject = minValue(5, errorMessage);

		it("passes for null or undefined", () => {
			expect(subject(null)).toBe(undefined);
			expect(subject(undefined)).toBe(undefined);
		});

		it("fails for a negative number", () => {
			expect(subject(-1)).toBe(errorMessage);
		});

		it("fails for 0", () => {
			expect(subject(0)).toBe(errorMessage);
		});

		it("fails for a smaller value", () => {
			expect(subject(3)).toBe(errorMessage);
		});

		it("passes for an exactly matching value", () => {
			expect(subject(5)).toBe(undefined);
		});

		it("passes for a larger value", () => {
			expect(subject(10)).toBe(undefined);
		});
	});

	describe("maxValue()", () => {
		const errorMessage = "Your answer must be less than 5";
		const subject = maxValue(5, errorMessage);

		it("passes for null or undefined", () => {
			expect(subject(null)).toBe(undefined);
			expect(subject(undefined)).toBe(undefined);
		});

		it("passes for a negative number", () => {
			expect(subject(-1)).toBe(undefined);
		});

		it("passes for 0", () => {
			expect(subject(0)).toBe(undefined);
		});

		it("passes for a smaller value", () => {
			expect(subject(3)).toBe(undefined);
		});

		it("passes for an exactly matching value", () => {
			expect(subject(5)).toBe(undefined);
		});

		it("fails for a larger value", () => {
			expect(subject(10)).toBe(errorMessage);
		});
	});

	describe("minSelected()", () => {
		const errorMessage = "You must choose a minimum of 2 option(s)";
		const subject = minSelected(2, errorMessage);

		it("fails for null or undefined", () => {
			expect(subject(null)).toBe(errorMessage);
			expect(subject(undefined)).toBe(errorMessage);
		});

		it("fails for an empty array", () => {
			expect(subject([])).toBe(errorMessage);
		});

		it("fails for a smaller array", () => {
			expect(subject([1])).toBe(errorMessage);
		});

		it("passes for an exactly matching array", () => {
			expect(subject([1, 2])).toBe(undefined);
		});

		it("passes for a larger array", () => {
			expect(subject([1, 2, 3])).toBe(undefined);
		});
	});

	describe("maxSelected()", () => {
		const errorMessage = "You must choose a maximum of 2 option(s)";
		const subject = maxSelected(2, errorMessage);

		it("passes for null or undefined", () => {
			expect(subject(null)).toBe(undefined);
			expect(subject(undefined)).toBe(undefined);
		});

		it("passes for an empty array", () => {
			expect(subject([])).toBe(undefined);
		});

		it("passes for a smaller array", () => {
			expect(subject([1])).toBe(undefined);
		});

		it("correctly handles zero values", () => {
			expect(subject([0, false, -1])).toBe(errorMessage);
		});

		it("passes for an exactly matching array", () => {
			expect(subject([1, 2])).toBe(undefined);
		});

		it("fails for a larger array", () => {
			expect(subject([1, 2, 3])).toBe(errorMessage);
		});
	});

	it.todo("uniqueArrayAttribute()");

	it.todo("uniqueByList()");

	it.todo("ISODate()");

	it.todo("allowedVariableName()");

	describe("greaterThan()", () => {
		const errorMessage = "Must be greater than the other field";
		const fieldPath = "parameters.min";
		const subject = greaterThan(fieldPath, errorMessage);

		it("passes when value is empty", () => {
			expect(subject(null, { parameters: { min: "2024-01-01" } })).toBe(undefined);
			expect(subject(undefined, { parameters: { min: "2024-01-01" } })).toBe(undefined);
			expect(subject("", { parameters: { min: "2024-01-01" } })).toBe(undefined);
		});

		it("passes when other field is empty", () => {
			expect(subject("2024-12-31", { parameters: { min: null } })).toBe(undefined);
			expect(subject("2024-12-31", { parameters: { min: undefined } })).toBe(undefined);
			expect(subject("2024-12-31", { parameters: {} })).toBe(undefined);
		});

		it("passes when value is greater than other field", () => {
			expect(subject("2024-12-31", { parameters: { min: "2024-01-01" } })).toBe(undefined);
			expect(subject("2024-06", { parameters: { min: "2024-01" } })).toBe(undefined);
			expect(subject("2025", { parameters: { min: "2024" } })).toBe(undefined);
			expect(subject(100, { parameters: { min: 50 } })).toBe(undefined);
		});

		it("fails when value is less than other field", () => {
			expect(subject("2024-01-01", { parameters: { min: "2024-12-31" } })).toBe(errorMessage);
			expect(subject("2024-01", { parameters: { min: "2024-06" } })).toBe(errorMessage);
			expect(subject("2023", { parameters: { min: "2024" } })).toBe(errorMessage);
			expect(subject(25, { parameters: { min: 50 } })).toBe(errorMessage);
		});

		it("fails when value equals other field", () => {
			expect(subject("2024-06-15", { parameters: { min: "2024-06-15" } })).toBe(errorMessage);
			expect(subject("2024-06", { parameters: { min: "2024-06" } })).toBe(errorMessage);
			expect(subject("2024", { parameters: { min: "2024" } })).toBe(errorMessage);
			expect(subject(50, { parameters: { min: 50 } })).toBe(errorMessage);
		});

		it("handles zero correctly", () => {
			expect(subject(0, { parameters: { min: -1 } })).toBe(undefined);
			expect(subject(0, { parameters: { min: 0 } })).toBe(errorMessage);
			expect(subject(0, { parameters: { min: 1 } })).toBe(errorMessage);
			expect(subject(1, { parameters: { min: 0 } })).toBe(undefined);
		});
	});

	describe("getValidations()", () => {
		it("passes custom message via object syntax", () => {
			const customMessage = "Custom error message";
			const validators = getValidations({ maxLength: { value: 5, message: customMessage } });
			expect(validators[0]("too long string")).toBe(customMessage);
		});

		it("uses default message when no custom message provided", () => {
			const validators = getValidations({ maxLength: 5 });
			expect(validators[0]("too long string")).toBe("Must be 5 characters or less");
		});

		it("handles uniqueByList with array as single option", () => {
			const existingNames = ["alice", "bob"];
			const validators = getValidations({ uniqueByList: existingNames });
			expect(validators[0]("alice")).toBe('"alice" is already in use');
			expect(validators[0]("charlie")).toBe(undefined);
		});

		it("handles uniqueByList with custom message", () => {
			const existingNames = ["alice", "bob"];
			const validators = getValidations({ uniqueByList: { value: existingNames, message: "Name taken" } });
			expect(validators[0]("alice")).toBe("Name taken");
			expect(validators[0]("charlie")).toBe(undefined);
		});
	});
});
