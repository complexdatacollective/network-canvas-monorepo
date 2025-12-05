import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { getFormSyncErrors } from "redux-form";
import { describe, expect, it, type Mock, vi } from "vitest";
import Issues from "../Issues";

vi.mock("redux-form");

const mockIssues = {
	foo: "bar",
	baz: [
		{
			buzz: "foo",
			beep: "boop",
		},
	],
};

const mockProps = {
	show: true,
	hideIssues: () => {},
};

const mockStore = configureStore({
	reducer: {
		form: () => ({}),
	},
});

describe("<Issues />", () => {
	it("will render", () => {
		(getFormSyncErrors as Mock).mockReturnValue(() => ({}));

		const { container } = render(
			<Provider store={mockStore}>
				<Issues {...mockProps} />
			</Provider>,
		);

		expect(container).toMatchSnapshot();
	});

	it("renders issues from object", () => {
		(getFormSyncErrors as Mock).mockReturnValue(() => mockIssues);

		const { container } = render(
			<Provider store={mockStore}>
				<Issues {...mockProps} show />
			</Provider>,
		);

		const issueElements = container.querySelectorAll("li.issues__issue");
		expect(issueElements).toHaveLength(3);
	});
});
