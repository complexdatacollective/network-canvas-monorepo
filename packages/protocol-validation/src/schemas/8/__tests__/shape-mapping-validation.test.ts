import { describe, expect, it } from "vitest";
import { createBaseProtocol } from "~/utils/test-utils";
import ProtocolSchemaV8 from "../schema";

describe("Shape Mapping Validation", () => {
	it("accepts a node definition with only a default shape", () => {
		const protocol = createBaseProtocol();
		protocol.codebook.node.person.shape = { default: "circle" };

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("accepts all valid shape values as defaults", () => {
		for (const shape of ["circle", "square", "diamond"] as const) {
			const protocol = createBaseProtocol();
			protocol.codebook.node.person.shape = { default: shape };

			const result = ProtocolSchemaV8.safeParse(protocol);
			expect(result.success).toBe(true);
		}
	});

	it("rejects an invalid default shape", () => {
		const protocol = createBaseProtocol();
		(protocol.codebook.node.person as Record<string, unknown>).shape = { default: "hexagon" };

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("accepts a discrete shape mapping", () => {
		const protocol = createBaseProtocol();
		protocol.codebook.node.person.shape = {
			default: "circle",
			dynamic: {
				variable: "category",
				type: "discrete",
				map: [
					{ value: "friend", shape: "circle" },
					{ value: "family", shape: "square" },
				],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("accepts a breakpoint shape mapping with 1 threshold", () => {
		const protocol = createBaseProtocol();
		protocol.codebook.node.person.shape = {
			default: "circle",
			dynamic: {
				variable: "age",
				type: "breakpoints",
				thresholds: [{ value: 30, shape: "square" }],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("accepts a breakpoint shape mapping with 2 thresholds", () => {
		const protocol = createBaseProtocol();
		protocol.codebook.node.person.shape = {
			default: "circle",
			dynamic: {
				variable: "age",
				type: "breakpoints",
				thresholds: [
					{ value: 20, shape: "square" },
					{ value: 40, shape: "diamond" },
				],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(true);
	});

	it("rejects a breakpoint shape mapping with 0 thresholds", () => {
		const protocol = createBaseProtocol();
		(protocol.codebook.node.person as Record<string, unknown>).shape = {
			default: "circle",
			dynamic: {
				variable: "age",
				type: "breakpoints",
				thresholds: [],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("rejects a breakpoint shape mapping with 3 thresholds", () => {
		const protocol = createBaseProtocol();
		(protocol.codebook.node.person as Record<string, unknown>).shape = {
			default: "circle",
			dynamic: {
				variable: "age",
				type: "breakpoints",
				thresholds: [
					{ value: 10, shape: "circle" },
					{ value: 20, shape: "square" },
					{ value: 30, shape: "diamond" },
				],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("rejects a node definition without shape field", () => {
		const protocol = createBaseProtocol();
		const personDef = protocol.codebook.node.person as Record<string, unknown>;
		delete personDef.shape;

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("rejects discrete mapping with duplicate values", () => {
		const protocol = createBaseProtocol();
		(protocol.codebook.node.person as Record<string, unknown>).shape = {
			default: "circle",
			dynamic: {
				variable: "category",
				type: "discrete",
				map: [
					{ value: "friend", shape: "circle" },
					{ value: "friend", shape: "square" },
				],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});

	it("rejects breakpoint thresholds not in ascending order", () => {
		const protocol = createBaseProtocol();
		(protocol.codebook.node.person as Record<string, unknown>).shape = {
			default: "circle",
			dynamic: {
				variable: "age",
				type: "breakpoints",
				thresholds: [
					{ value: 40, shape: "square" },
					{ value: 20, shape: "diamond" },
				],
			},
		};

		const result = ProtocolSchemaV8.safeParse(protocol);
		expect(result.success).toBe(false);
	});
});
