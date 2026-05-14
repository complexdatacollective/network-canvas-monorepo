import type { Codebook } from "@codaco/protocol-validation";
import { describe, expect, it } from "vitest";

import type { RootState } from "~/ducks/modules/root";
import testState from "../../../__tests__/testState.json" with { type: "json" };
import { getAllVariablesByUUID, getVariableOptionsForSubject, makeGetVariable } from "..";

describe("codebook selectors", () => {
	describe("getVariableOptionsForSubject()", () => {
		it("extracts variables for nodeType into options list for node entity", () => {
			const subject = {
				type: "bar",
				entity: "node" as const,
			};

			const result = getVariableOptionsForSubject(testState as unknown as RootState, subject);

			expect(result).toMatchSnapshot();
		});

		it("extracts variables for nodeType into options list for ego entity", () => {
			const subject = {
				type: undefined,
				entity: "ego" as const,
			};

			const result = getVariableOptionsForSubject(testState as unknown as RootState, subject);

			expect(result).toMatchSnapshot();
		});
	});

	describe("getAllVariablesByUUID()", () => {
		it("returns all variables by UUID", () => {
			const result = getAllVariablesByUUID(testState.activeProtocol.present.codebook as unknown as Codebook);

			expect(result).toMatchSnapshot();
		});

		it("handles missing codebook", () => {
			const result = getAllVariablesByUUID(undefined as unknown as Codebook);

			expect(result).toMatchSnapshot();
		});

		it("handles missing nodeTypes", () => {
			const result = getAllVariablesByUUID({
				edge: {},
				ego: {},
			} as unknown as Codebook);

			expect(result).toMatchSnapshot();
		});

		it("handles missing edgeTypes", () => {
			const result = getAllVariablesByUUID({
				node: {},
				ego: {},
			} as unknown as Codebook);

			expect(result).toMatchSnapshot();
		});

		it("handles missing ego", () => {
			const result = getAllVariablesByUUID({
				node: {},
				edge: {},
			} as unknown as Codebook);

			expect(result).toMatchSnapshot();
		});

		it("handles missing variables", () => {
			const result = getAllVariablesByUUID({
				node: {
					foo: {},
				},
				edge: {
					bar: {},
				},
				ego: {},
			} as unknown as Codebook);

			expect(result).toMatchSnapshot();
		});
	});

	describe("makeGetVariable()", () => {
		it("returns a variable by UUID", () => {
			const result = makeGetVariable("foo")(testState as unknown as RootState);

			expect(result).toMatchSnapshot();
		});

		it("returns null if variable is not found", () => {
			const result = makeGetVariable("not found")(testState as unknown as RootState);

			expect(result).toBeNull();
		});

		it("returns error if codebook is not found", () => {
			expect(() => makeGetVariable("foo")({} as unknown as RootState)).toThrow();
		});
	});
});
