import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import App from "../ViewManager/views/App";

// Mock the components that App renders
vi.mock("~/components/Routes", () => ({
	default: () => <div data-testid="routes" />,
}));
vi.mock("~/components/DialogManager", () => ({
	default: () => <div data-testid="dialog-manager" />,
}));
vi.mock("~/components/ToastManager", () => ({
	default: () => <div data-testid="toast-manager" />,
}));

const mockStore = configureStore({
	reducer: {
		app: () => ({}),
		ui: () => ({}),
		protocols: () => ({}),
	},
});

describe("<App />", () => {
	it("renders main app components", () => {
		const { getByTestId } = render(
			<Provider store={mockStore}>
				<App />
			</Provider>,
		);

		expect(getByTestId("routes")).toBeInTheDocument();
		expect(getByTestId("dialog-manager")).toBeInTheDocument();
		expect(getByTestId("toast-manager")).toBeInTheDocument();
	});
});
