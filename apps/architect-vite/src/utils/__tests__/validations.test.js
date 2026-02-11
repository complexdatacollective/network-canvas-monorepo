import { describe, expect, it } from "vitest";
import { validations } from "../validations";

const { afterDate, maxLength, maxSelected, maxValue, minLength, minSelected, minValue, required } = validations;

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

	describe("afterDate()", () => {
		const errorMessage = "End date must be after start date";
		const fieldPath = "parameters.min";
		const subject = afterDate(fieldPath, errorMessage);

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

		it("passes when end date is after start date", () => {
			expect(subject("2024-12-31", { parameters: { min: "2024-01-01" } })).toBe(undefined);
			expect(subject("2024-06", { parameters: { min: "2024-01" } })).toBe(undefined);
			expect(subject("2025", { parameters: { min: "2024" } })).toBe(undefined);
		});

		it("fails when end date is before start date", () => {
			expect(subject("2024-01-01", { parameters: { min: "2024-12-31" } })).toBe(errorMessage);
			expect(subject("2024-01", { parameters: { min: "2024-06" } })).toBe(errorMessage);
			expect(subject("2023", { parameters: { min: "2024" } })).toBe(errorMessage);
		});

		it("fails when end date equals start date", () => {
			expect(subject("2024-06-15", { parameters: { min: "2024-06-15" } })).toBe(errorMessage);
			expect(subject("2024-06", { parameters: { min: "2024-06" } })).toBe(errorMessage);
			expect(subject("2024", { parameters: { min: "2024" } })).toBe(errorMessage);
		});

		it("passes when dates are invalid", () => {
			expect(subject("invalid", { parameters: { min: "2024-01-01" } })).toBe(undefined);
			expect(subject("2024-12-31", { parameters: { min: "invalid" } })).toBe(undefined);
		});
	});
});
