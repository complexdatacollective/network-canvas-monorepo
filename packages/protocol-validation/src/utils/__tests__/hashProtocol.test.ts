import { describe, expect, it } from "vitest";
import { hashProtocol } from "../hashProtocol";

describe("hashProtocol", () => {
	it("produces a stable string for the same codebook+stages", () => {
		const protocol = {
			codebook: { node: { person: { variables: {} } } },
			stages: [{ id: "s1", type: "Information" }],
		};
		expect(hashProtocol(protocol)).toBe(hashProtocol(protocol));
	});

	it("ignores fields outside codebook and stages", () => {
		const a = {
			codebook: { node: {} },
			stages: [],
			name: "Name A",
			description: "desc",
			lastModified: "2026-01-01",
			assetManifest: { foo: {} },
			experiments: { x: 1 },
		};
		const b = {
			codebook: { node: {} },
			stages: [],
			name: "Name B",
			description: "different",
			lastModified: "2026-12-31",
			assetManifest: { bar: {} },
			experiments: { y: 2 },
		};
		expect(hashProtocol(a)).toBe(hashProtocol(b));
	});

	it("changes when codebook changes", () => {
		const a = { codebook: { node: { person: {} } }, stages: [] };
		const b = { codebook: { node: { place: {} } }, stages: [] };
		expect(hashProtocol(a)).not.toBe(hashProtocol(b));
	});

	it("changes when stages change", () => {
		const a = { codebook: {}, stages: [{ id: "s1" }] };
		const b = { codebook: {}, stages: [{ id: "s2" }] };
		expect(hashProtocol(a)).not.toBe(hashProtocol(b));
	});

	it("returns a non-empty string", () => {
		const result = hashProtocol({ codebook: {}, stages: [] });
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});
