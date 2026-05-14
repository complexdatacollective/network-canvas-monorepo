import { describe, expect, it, vi } from "vitest";
import type { RootState } from "~/ducks/modules/root";

import mockState from "../../../../__tests__/testState.json" with { type: "json" };
import { getEdgesForSubject, getHighlightVariablesForSubject, getLayoutVariablesForSubject } from "../selectors";

vi.mock("redux-form", () => ({
	formValueSelector: () => () => "1234-1234-4",
	getFormValues: () => () => ({}),
	reduxForm: () => (component: unknown) => component,
}));

const subject = {
	entity: "node",
	type: "1234-1234-1234",
};

describe("SociogramPrompts", () => {
	describe("selectors", () => {
		it("get layout variables for node type", () => {
			const result = getLayoutVariablesForSubject(mockState as unknown as RootState, subject);

			expect(result).toMatchSnapshot();
		});

		it("get highlight variables for node type", () => {
			const result = getHighlightVariablesForSubject(mockState as unknown as RootState, {
				type: subject.type,
				entity: subject.entity,
			});

			expect(result).toMatchSnapshot();
		});

		it("get edges for node type", () => {
			const result = getEdgesForSubject(mockState as unknown as RootState);

			expect(result).toMatchSnapshot();
		});

		it("get edge filters", () => {
			const result = getEdgesForSubject(mockState as unknown as RootState);

			expect(result).toMatchSnapshot();
		});
	});
});
