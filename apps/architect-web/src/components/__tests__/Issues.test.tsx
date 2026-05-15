import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { getFormSyncErrors, hasSubmitFailed } from "redux-form";
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

const mockStore = configureStore({
	reducer: {
		form: () => ({}),
	},
});

describe("<Issues />", () => {
	it("will render", () => {
		(getFormSyncErrors as Mock).mockReturnValue(() => ({}));
		(hasSubmitFailed as Mock).mockReturnValue(() => false);

		const { container } = render(
			<Provider store={mockStore}>
				<Issues />
			</Provider>,
		);

		expect(container).toMatchSnapshot();
	});

	it("renders issues from object", () => {
		(getFormSyncErrors as Mock).mockReturnValue(() => mockIssues);
		(hasSubmitFailed as Mock).mockReturnValue(() => true);

		render(
			<Provider store={mockStore}>
				<Issues />
			</Provider>,
		);

		// Popover content lives in a portal mounted to document.body, and opens
		// automatically on mount because submitFailed + hasIssues.
		const issueElements = document.querySelectorAll('li[data-testid="issue"]');
		expect(issueElements).toHaveLength(3);
	});
});
