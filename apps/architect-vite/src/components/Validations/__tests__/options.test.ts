import { describe, expect, it } from "vitest";
import {
	getValidationOptionsForVariableType,
	isValidationWithListValue,
	isValidationWithNumberValue,
	isValidationWithoutValue,
} from "../options";

describe("Validation options", () => {
	describe("getValidationOptionsForVariableType", () => {
		describe("lessThanVariable and greaterThanVariable availability", () => {
			const typesWithComparisonValidations = ["number", "datetime", "scalar"];
			const typesWithoutComparisonValidations = ["text", "boolean", "ordinal", "categorical", "passphrase"];

			it.each(
				typesWithComparisonValidations,
			)("includes lessThanVariable and greaterThanVariable for %s type", (variableType) => {
				const options = getValidationOptionsForVariableType(variableType, "node");
				const optionValues = options.map((o) => o.value);

				expect(optionValues).toContain("lessThanVariable");
				expect(optionValues).toContain("greaterThanVariable");
			});

			it.each(
				typesWithoutComparisonValidations,
			)("does not include lessThanVariable and greaterThanVariable for %s type", (variableType) => {
				const options = getValidationOptionsForVariableType(variableType, "node");
				const optionValues = options.map((o) => o.value);

				expect(optionValues).not.toContain("lessThanVariable");
				expect(optionValues).not.toContain("greaterThanVariable");
			});
		});

		describe("entity-specific validation filtering", () => {
			it("excludes unique validation for ego entity", () => {
				const nodeOptions = getValidationOptionsForVariableType("text", "node");
				const egoOptions = getValidationOptionsForVariableType("text", "ego");

				expect(nodeOptions.map((o) => o.value)).toContain("unique");
				expect(egoOptions.map((o) => o.value)).not.toContain("unique");
			});
		});
	});

	describe("isValidationWithListValue", () => {
		it("returns true for lessThanVariable", () => {
			expect(isValidationWithListValue("lessThanVariable")).toBe(true);
		});

		it("returns true for greaterThanVariable", () => {
			expect(isValidationWithListValue("greaterThanVariable")).toBe(true);
		});

		it("returns true for differentFrom and sameAs", () => {
			expect(isValidationWithListValue("differentFrom")).toBe(true);
			expect(isValidationWithListValue("sameAs")).toBe(true);
		});

		it("returns false for number-based validations", () => {
			expect(isValidationWithListValue("minValue")).toBe(false);
			expect(isValidationWithListValue("maxValue")).toBe(false);
			expect(isValidationWithListValue("minLength")).toBe(false);
		});
	});

	describe("isValidationWithNumberValue", () => {
		it("returns true for number-based validations", () => {
			expect(isValidationWithNumberValue("minValue")).toBe(true);
			expect(isValidationWithNumberValue("maxValue")).toBe(true);
			expect(isValidationWithNumberValue("minLength")).toBe(true);
			expect(isValidationWithNumberValue("maxLength")).toBe(true);
			expect(isValidationWithNumberValue("minSelected")).toBe(true);
			expect(isValidationWithNumberValue("maxSelected")).toBe(true);
		});

		it("returns false for list-based validations", () => {
			expect(isValidationWithNumberValue("lessThanVariable")).toBe(false);
			expect(isValidationWithNumberValue("greaterThanVariable")).toBe(false);
			expect(isValidationWithNumberValue("differentFrom")).toBe(false);
			expect(isValidationWithNumberValue("sameAs")).toBe(false);
		});
	});

	describe("isValidationWithoutValue", () => {
		it("returns true for required and unique", () => {
			expect(isValidationWithoutValue("required")).toBe(true);
			expect(isValidationWithoutValue("unique")).toBe(true);
		});

		it("returns false for validations that require values", () => {
			expect(isValidationWithoutValue("minValue")).toBe(false);
			expect(isValidationWithoutValue("lessThanVariable")).toBe(false);
		});
	});
});
