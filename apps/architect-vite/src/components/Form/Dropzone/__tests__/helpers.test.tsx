import { describe, expect, it } from "vitest";

import { acceptsFiles, getAcceptsExtensions, getRejectedExtensions } from "../helpers";

// Helper function to create mock File objects
const createMockFile = (name: string): File => {
	return new File([], name, { type: "text/plain" });
};

describe("acceptsFiles(accepts, files)", () => {
	it("given a list of file extensions, and a list of files it checks all files are valid", () => {
		const accepts = [".foo", ".baz4", ".b3uzz"];
		const passingFiles = [createMockFile("file.foo"), createMockFile("file.baz4"), createMockFile("file.b3uzz")];
		const mixedCaseFiles = [createMockFile("file.FOO"), createMockFile("file.bAZ4")];
		const failingFiles = [createMockFile("file.foo"), createMockFile("file.fizz")];

		expect(acceptsFiles(accepts, passingFiles)).toBe(true);
		expect(acceptsFiles(accepts, mixedCaseFiles)).toBe(true);
		expect(acceptsFiles(accepts, failingFiles)).toBe(false);
	});
});

describe("getRejectedExtensions(accepts, files)", () => {
	it("given a list of file extensions, and a list of files it returns those that do not match", () => {
		const accepts = [".foo", ".bar", ".baz4", ".b3uzz"];
		const passingFiles = [
			createMockFile("file.foo"),
			createMockFile("file.bar"),
			createMockFile("file.baz4"),
			createMockFile("file.b3uzz"),
		];
		const failingFiles = [createMockFile("file.foo"), createMockFile("file.FIZZ"), createMockFile("file.pop")];

		expect(getRejectedExtensions(accepts, passingFiles)).toEqual([]);
		expect(getRejectedExtensions(accepts, failingFiles)).toEqual([".FIZZ", ".pop"]);
	});
});

describe("getAcceptsExtensions(accepts)", () => {
	it('given a list of file extensions, it returns them without the "."', () => {
		const accepts = [".foo", ".bar", ".baz4", ".b3uzz"];

		expect(getAcceptsExtensions(accepts)).toEqual(["foo", "bar", "baz4", "b3uzz"]);
	});
});
