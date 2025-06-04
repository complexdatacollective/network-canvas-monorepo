import { describe, it, expect, vi } from "vitest";

import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import TypeEditorScreen from "../TypeEditorScreen";

// Mock the TypeEditor component
vi.mock("../../TypeEditor", () => ({
	default: () => <div data-testid="type-editor" />,
	formName: "typeEditor",
}));

// Mock the EditorScreen component
vi.mock("../../Screen/EditorScreen", () => ({
	default: ({ editor: Editor }) => (
		<div data-testid="editor-screen">
			<Editor />
		</div>
	),
}));

const mockStore = configureStore({
	reducer: {
		form: () => ({}),
		protocol: () => ({ present: { codebook: {} } }),
		ui: () => ({}),
	},
});

const mockProps = {};

describe("<TypeEditorScreen />", () => {
	it("can render", () => {
		const { getByTestId } = render(
			<Provider store={mockStore}>
				<TypeEditorScreen {...mockProps} />
			</Provider>,
		);

		expect(getByTestId("editor-screen")).toBeInTheDocument();
		expect(getByTestId("type-editor")).toBeInTheDocument();
	});
});
