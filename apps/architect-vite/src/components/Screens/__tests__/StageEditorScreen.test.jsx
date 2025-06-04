import { describe, it, expect, vi } from "vitest";

import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import StageEditorScreen from "../StageEditorScreen";

// Mock the StageEditor component
vi.mock("../../StageEditor", () => ({
	default: () => <div data-testid="stage-editor" />,
	formName: "stageEditor",
}));

// Mock the EditorScreen component
vi.mock("../../Screen/EditorScreen", () => ({
	default: ({ editor: Editor }) => (
		<div data-testid="editor-screen">
			<Editor />
		</div>
	),
}));

// Mock the legacy Button component
vi.mock("~/lib/legacy-ui/components", () => ({
	Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

const mockState = {
	protocol: {
		present: {
			stages: [],
		},
	},
	form: {
		stageEditor: {},
	},
	ui: {},
};

const mockStore = configureStore({
	reducer: {
		protocol: () => mockState.protocol,
		form: () => mockState.form,
		ui: () => mockState.ui,
	},
});

const mockProps = {
	show: true,
	id: "test-stage-id",
	insertAtIndex: 0,
};

describe("<StageEditorScreen />", () => {
	it("can render", () => {
		const { getByTestId } = render(
			<Provider store={mockStore}>
				<StageEditorScreen {...mockProps} />
			</Provider>,
		);

		expect(getByTestId("editor-screen")).toBeInTheDocument();
		expect(getByTestId("stage-editor")).toBeInTheDocument();
	});

	it.skip("hides preview button when form is invalid", () => {});
});
