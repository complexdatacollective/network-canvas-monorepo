import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, truncate } from "./format";

describe("formatDate", () => {
	it("renders an em-dash for null/undefined", () => {
		expect(formatDate(null)).toBe("—");
		expect(formatDate(undefined)).toBe("—");
	});

	it("falls back to the original string when invalid", () => {
		expect(formatDate("not a date")).toMatch(/Invalid|not a date/);
	});
});

describe("formatBytes", () => {
	it("returns 0 B for non-positive", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(-1)).toBe("0 B");
	});

	it("scales up", () => {
		expect(formatBytes(1024)).toMatch(/KB/);
		expect(formatBytes(1024 * 1024)).toMatch(/MB/);
		expect(formatBytes(1024 * 1024 * 1024)).toMatch(/GB/);
	});
});

describe("truncate", () => {
	it("returns the original string when short enough", () => {
		expect(truncate("hi", 10)).toBe("hi");
	});

	it("adds an ellipsis when too long", () => {
		expect(truncate("abcdefghij", 5)).toBe("abcd…");
	});
});
