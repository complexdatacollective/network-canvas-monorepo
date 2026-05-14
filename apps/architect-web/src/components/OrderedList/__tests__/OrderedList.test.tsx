import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import type { Dispatch } from "redux";
import type { WrappedFieldProps } from "redux-form";
import { describe, expect, it } from "vitest";
import type { OrderedListProps } from "../OrderedList";
import OrderedList from "../OrderedList";

const mockProps: WrappedFieldProps & OrderedListProps = {
	input: {
		name: "test-field",
		value: [{ id: "1", name: "Test Item" }],
		onChange: () => {},
		onBlur: () => {},
		onFocus: () => {},
		onDragStart: () => {},
		onDrop: () => {},
	},
	meta: {
		active: false,
		asyncValidating: false,
		autofilled: false,
		dirty: false,
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		dispatch: (() => ({})) as Dispatch<any>,
		error: undefined,
		form: "form",
		initial: undefined,
		invalid: false,
		pristine: true,
		submitFailed: false,
		submitting: false,
		touched: false,
		valid: true,
		visited: false,
		warning: undefined,
	},
	item: () => null,
};

const createTestStore = () => {
	return configureStore({
		reducer: {
			// Minimal reducer for testing
			test: (state = {}) => state,
		},
	});
};

const renderWithProvider = (component: ReactNode) => {
	const store = createTestStore();
	return render(<Provider store={store}>{component}</Provider>);
};

describe("<OrderedList />", () => {
	describe("errors", () => {
		it("shows no errors by default", () => {
			const { container } = renderWithProvider(<OrderedList {...mockProps} />);

			expect(container.querySelector(".text-destructive")).not.toBeInTheDocument();
		});

		it("shows error on submit", () => {
			const { container } = renderWithProvider(
				<OrderedList
					{...mockProps}
					meta={{
						...mockProps.meta,
						submitFailed: true,
						error: "foo",
					}}
				/>,
			);

			expect(container.querySelector(".text-destructive")).toBeInTheDocument();
		});

		it("shows error on changed", () => {
			const { container } = renderWithProvider(
				<OrderedList
					{...mockProps}
					meta={{
						...mockProps.meta,
						dirty: true,
						error: "foo",
					}}
				/>,
			);

			expect(container.querySelector(".text-destructive")).toBeInTheDocument();
		});
	});
});
