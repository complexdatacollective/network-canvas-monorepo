import { describe, expect, it } from "vitest";
import {
	getValidationOptionsForVariableType,
	isValidationWithListValue,
	isValidationWithNumberValue,
	isValidationWithoutValue,
} from "../options";

describe("Validation options", () => {
	describe("getValidationOptionsForVariableType", () => {
		describe("comparison variable validations availability", () => {
			const typesWithComparisonValidations = ["number", "datetime", "scalar"];
			const typesWithoutComparisonValidations = ["text", "boolean", "ordinal", "categorical", "passphrase"];

			it.each(typesWithComparisonValidations)("includes all comparison validations for %s type", (variableType) => {
				const options = getValidationOptionsForVariableType(variableType, "node");
				const optionValues = options.map((o) => o.value);

				expect(optionValues).toContain("lessThanVariable");
				expect(optionValues).toContain("greaterThanVariable");
				expect(optionValues).toContain("lessThanOrEqualToVariable");
				expect(optionValues).toContain("greaterThanOrEqualToVariable");
			});

			it.each(
				typesWithoutComparisonValidations,
			)("does not include comparison validations for %s type", (variableType) => {
				const options = getValidationOptionsForVariableType(variableType, "node");
				const optionValues = options.map((o) => o.value);

				expect(optionValues).not.toContain("lessThanVariable");
				expect(optionValues).not.toContain("greaterThanVariable");
				expect(optionValues).not.toContain("lessThanOrEqualToVariable");
				expect(optionValues).not.toContain("greaterThanOrEqualToVariable");
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

		it("returns true for lessThanOrEqualToVariable", () => {
			expect(isValidationWithListValue("lessThanOrEqualToVariable")).toBe(true);
		});

		it("returns true for greaterThanOrEqualToVariable", () => {
			expect(isValidationWithListValue("greaterThanOrEqualToVariable")).toBe(true);
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
			expect(isValidationWithNumberValue("lessThanOrEqualToVariable")).toBe(false);
			expect(isValidationWithNumberValue("greaterThanOrEqualToVariable")).toBe(false);
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
