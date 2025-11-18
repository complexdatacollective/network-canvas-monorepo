import { describe, expect, it } from "vitest";
import {
	MigrationError,
	MigrationNotPossibleError,
	MigrationStepError,
	SchemaVersionDetectionError,
	ValidationError,
	VersionMismatchError,
} from "../errors";

describe("Migration Errors", () => {
	describe("MigrationError", () => {
		it("should create a basic migration error", () => {
			const error = new MigrationError("Something went wrong");
			expect(error).toBeInstanceOf(Error);
			expect(error.message).toBe("Something went wrong");
			expect(error.name).toBe("MigrationError");
		});

		it("should be catchable as Error", () => {
			try {
				throw new MigrationError("Test error");
			} catch (e) {
				expect(e).toBeInstanceOf(Error);
				expect(e).toBeInstanceOf(MigrationError);
			}
		});

		it("should preserve stack trace", () => {
			const error = new MigrationError("Test");
			expect(error.stack).toBeDefined();
			expect(error.stack).toContain("MigrationError");
		});
	});

	describe("MigrationNotPossibleError", () => {
		it("should create error with version information", () => {
			const error = new MigrationNotPossibleError(6, 8);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error.name).toBe("MigrationNotPossibleError");
			expect(error.message).toBe("Migration to this version is not possible (6 -> 8).");
		});

		it("should format message correctly for different versions", () => {
			const error = new MigrationNotPossibleError(7, 9);
			expect(error.message).toContain("7 -> 9");
		});

		it("should inherit from MigrationError", () => {
			const error = new MigrationNotPossibleError(6, 8);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("VersionMismatchError", () => {
		it("should create error for nonsensical migration path", () => {
			const error = new VersionMismatchError(8, 7);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error.name).toBe("VersionMismatchError");
			expect(error.message).toBe(
				"Nonsensical migration path (8 -> 7). Source version must be lower than target version.",
			);
		});

		it("should format message correctly", () => {
			const error = new VersionMismatchError(9, 6);
			expect(error.message).toContain("9 -> 6");
			expect(error.message).toContain("Source version must be lower than target version");
		});

		it("should inherit from MigrationError", () => {
			const error = new VersionMismatchError(8, 7);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("MigrationStepError", () => {
		it("should create error with version information", () => {
			const error = new MigrationStepError(7);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error.name).toBe("MigrationStepError");
			expect(error.message).toBe("Migration step failed at version 7.");
		});

		it("should format message correctly for different versions", () => {
			const error = new MigrationStepError(8);
			expect(error.message).toBe("Migration step failed at version 8.");
		});

		it("should inherit from MigrationError", () => {
			const error = new MigrationStepError(7);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe("SchemaVersionDetectionError", () => {
		it("should create error with default message", () => {
			const error = new SchemaVersionDetectionError();
			expect(error).toBeInstanceOf(MigrationError);
			expect(error.name).toBe("SchemaVersionDetectionError");
			expect(error.message).toBe("Unable to detect schema version from document");
		});

		it("should inherit from MigrationError", () => {
			const error = new SchemaVersionDetectionError();
			expect(error).toBeInstanceOf(MigrationError);
			expect(error).toBeInstanceOf(Error);
		});

		it("should have consistent message", () => {
			const error1 = new SchemaVersionDetectionError();
			const error2 = new SchemaVersionDetectionError();
			expect(error1.message).toBe(error2.message);
		});
	});

	describe("ValidationError", () => {
		it("should create error with message and version", () => {
			const error = new ValidationError("Invalid protocol structure", 8);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error.name).toBe("ValidationError");
			expect(error.message).toBe("Validation failed for version 8: Invalid protocol structure");
		});

		it("should create error with message only", () => {
			const error = new ValidationError("Invalid protocol structure");
			expect(error.message).toBe("Validation failed: Invalid protocol structure");
		});

		it("should format message correctly with version", () => {
			const error = new ValidationError("Missing required field", 7);
			expect(error.message).toBe("Validation failed for version 7: Missing required field");
		});

		it("should format message correctly without version", () => {
			const error = new ValidationError("Missing required field");
			expect(error.message).toBe("Validation failed: Missing required field");
		});

		it("should inherit from MigrationError", () => {
			const error = new ValidationError("Test", 8);
			expect(error).toBeInstanceOf(MigrationError);
			expect(error).toBeInstanceOf(Error);
		});

		it("should handle complex error messages", () => {
			const complexMessage =
				"Multiple validation errors: field 'name' is required, field 'age' must be a number";
			const error = new ValidationError(complexMessage, 8);
			expect(error.message).toContain(complexMessage);
			expect(error.message).toContain("version 8");
		});
	});

	describe("Error instanceof checks", () => {
		it("should allow checking specific error types", () => {
			const errors = [
				new MigrationError("base"),
				new MigrationNotPossibleError(6, 8),
				new VersionMismatchError(8, 7),
				new MigrationStepError(7),
				new SchemaVersionDetectionError(),
				new ValidationError("test", 8),
			];

			for (const error of errors) {
				expect(error).toBeInstanceOf(Error);
				expect(error).toBeInstanceOf(MigrationError);
			}
		});

		it("should distinguish between error types", () => {
			const notPossibleError = new MigrationNotPossibleError(6, 8);
			const versionMismatchError = new VersionMismatchError(8, 7);

			expect(notPossibleError).toBeInstanceOf(MigrationNotPossibleError);
			expect(notPossibleError).not.toBeInstanceOf(VersionMismatchError);

			expect(versionMismatchError).toBeInstanceOf(VersionMismatchError);
			expect(versionMismatchError).not.toBeInstanceOf(MigrationNotPossibleError);
		});
	});

	describe("Error handling in try-catch", () => {
		it("should be catchable and identifiable", () => {
			try {
				throw new ValidationError("Test validation error", 8);
			} catch (e) {
				expect(e).toBeInstanceOf(ValidationError);
				if (e instanceof ValidationError) {
					expect(e.message).toContain("Test validation error");
				}
			}
		});

		it("should allow specific error type catching", () => {
			const throwError = (type: string) => {
				switch (type) {
					case "detection":
						throw new SchemaVersionDetectionError();
					case "validation":
						throw new ValidationError("Invalid", 8);
					case "notPossible":
						throw new MigrationNotPossibleError(6, 8);
					default:
						throw new Error("Unknown");
				}
			};

			expect(() => throwError("detection")).toThrow(SchemaVersionDetectionError);
			expect(() => throwError("validation")).toThrow(ValidationError);
			expect(() => throwError("notPossible")).toThrow(MigrationNotPossibleError);
		});
	});
});
