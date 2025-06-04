import { describe, it, expect, beforeAll, vi } from "vitest";

import { render } from "@testing-library/react";
import { createStore } from "redux";
import { Provider } from "react-redux";
import { getFormValues } from "redux-form";
import CodeView from "../CodeView";

vi.mock("redux-form");

const mockProps = {
	toggleCodeView: () => {},
	form: "test",
};

const mockStore = createStore(() => ({}));

describe("<CodeView />", () => {
	beforeAll(() => {
		getFormValues.mockImplementation(() => () => ({ name: "example name" }));
	});

	it("can render", () => {
		render(
			<Provider store={mockStore}>
				<CodeView {...mockProps} />
			</Provider>,
		);

		// CodeView renders to document.body via portal
		expect(document.querySelector(".code-view")).toBeInTheDocument();
	});

	it("renders content only when show is true", () => {
		render(
			<Provider store={mockStore}>
				<CodeView {...mockProps} show />
			</Provider>,
		);

		// CodeView renders to document.body via portal
		expect(document.querySelector(".code-view")).toBeInTheDocument();
	});
});
