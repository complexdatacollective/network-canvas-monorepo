import { describe, expect, it } from "vitest";
import { FlagResolver } from "../rendering/FlagResolver";

describe("FlagResolver", () => {
	it("should convert country code to flag emoji", () => {
		const resolver = new FlagResolver();

		expect(resolver.resolve("US")).toBe("\u{1F1FA}\u{1F1F8}");
		expect(resolver.resolve("GB")).toBe("\u{1F1EC}\u{1F1E7}");
		expect(resolver.resolve("DE")).toBe("\u{1F1E9}\u{1F1EA}");
		expect(resolver.resolve("JP")).toBe("\u{1F1EF}\u{1F1F5}");
	});

	it("should return globe emoji for unknown country code", () => {
		const resolver = new FlagResolver();

		expect(resolver.resolve("XX")).toBe("\u{1F310}");
	});

	it("should return globe emoji for invalid codes", () => {
		const resolver = new FlagResolver();

		expect(resolver.resolve("")).toBe("\u{1F310}");
		expect(resolver.resolve("A")).toBe("\u{1F310}");
		expect(resolver.resolve("ABC")).toBe("\u{1F310}");
	});

	it("should handle lowercase country codes", () => {
		const resolver = new FlagResolver();

		expect(resolver.resolve("us")).toBe("\u{1F1FA}\u{1F1F8}");
		expect(resolver.resolve("gb")).toBe("\u{1F1EC}\u{1F1E7}");
	});

	it("should cache resolved flags", () => {
		const resolver = new FlagResolver();

		const first = resolver.resolve("US");
		const second = resolver.resolve("US");

		expect(first).toBe(second);
	});

	it("should preload country codes into cache", () => {
		const resolver = new FlagResolver();

		resolver.preload(["US", "GB", "DE"]);

		expect(resolver.resolve("US")).toBe("\u{1F1FA}\u{1F1F8}");
		expect(resolver.resolve("GB")).toBe("\u{1F1EC}\u{1F1E7}");
		expect(resolver.resolve("DE")).toBe("\u{1F1E9}\u{1F1EA}");
	});
});
