import { describe, expect, it } from "vitest";
import type { RootState } from "~/ducks/modules/root";
import { getEdgesForSubject, getNarrativeVariables } from "../selectors";

const subject = {
	entity: "node" as const,
	type: "1234-1234-1234",
};

const mockCodebook = {
	node: {
		[subject.type]: {
			variables: {
				"1234-1234-1": {
					name: "my layout",
					type: "layout",
				},
				"1234-1234-2": {
					name: "my category",
					type: "categorical",
				},
				"1234-1234-3": {
					name: "my boolean",
					type: "boolean",
				},
			},
		},
	},
	edge: {
		"1234-5": {
			name: "an edge",
			color: "blue",
		},
	},
};

const mockState = {
	activeProtocol: {
		present: {
			codebook: mockCodebook,
		},
	},
} as unknown as RootState;

describe("NarrativePresets", () => {
	describe("selectors", () => {
		it("get narrative variables for node type", () => {
			expect.assertions(3);

			const { layoutVariablesForSubject, highlightVariablesForSubject, groupVariablesForSubject } =
				getNarrativeVariables(mockState, subject);

			expect(layoutVariablesForSubject).toEqual([
				{
					value: "1234-1234-1",
					label: "my layout",
					type: "layout",
					isUsed: false,
				},
			]);

			expect(highlightVariablesForSubject).toEqual([
				{
					value: "1234-1234-3",
					label: "my boolean",
					type: "boolean",
					isUsed: false,
				},
			]);

			expect(groupVariablesForSubject).toEqual([
				{
					isUsed: false,
					value: "1234-1234-2",
					label: "my category",
					type: "categorical",
				},
			]);
		});

		it("get edges for node type", () => {
			const result = getEdgesForSubject(mockState);

			expect(result).toEqual([
				{
					value: "1234-5",
					label: "an edge",
					color: "blue",
				},
			]);
		});
	});
});
