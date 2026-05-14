import { describe, expect, it } from "vitest";

import { getMockState } from "~/__tests__/helpers";

import type { RootState } from "~/ducks/modules/root";
import { getAssetIndex, getEdgeIndex, getNodeIndex, getVariableIndex, utils } from "../indexes";

const testState = getMockState() as unknown as RootState;

describe("indexes selectors", () => {
	describe("utils.buildSearch()", () => {
		it("correctly builds the Set", () => {
			const index1: Record<string, string> = {
				foo: "1",
				bar: "2",
				bazz: "3",
				fizz: "4",
			};

			const index2: Record<string, string> = {
				foo: "3",
				bar: "4",
				bazz: "5",
				fizz: "6",
			};

			const excludeList = ["3"];

			const search = utils.buildSearch([index1, index2], [excludeList]);

			expect(search).toEqual(new Set(["1", "2", "4", "5", "6"]));
		});
	});

	describe("getVariableIndex()", () => {
		it("extracts variables into index", () => {
			const subject = getVariableIndex(testState);

			expect(subject).toMatchSnapshot();
		});
	});

	describe("getAssetIndex()", () => {
		it("extracts asset references into index", () => {
			const subject = getAssetIndex(testState);

			expect(subject).toMatchSnapshot();
		});
	});

	describe("getNodeIndex()", () => {
		it("extracts subject references into type index", () => {
			const subject = getNodeIndex(testState);

			expect(subject).toMatchSnapshot();
		});
	});

	describe("getEdgeIndex()", () => {
		it("extracts subject references into type index", () => {
			const subject = getEdgeIndex(testState);

			expect(subject).toMatchSnapshot();
		});
	});
});
