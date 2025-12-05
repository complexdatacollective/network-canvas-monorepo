import { render } from "@testing-library/react";
import type { Dispatch } from "redux";
import type { WrappedFieldProps } from "redux-form";
import { describe, expect, it } from "vitest";
import type { OrderedListProps } from "../OrderedList";
import OrderedList from "../OrderedList";

const mockProps: WrappedFieldProps & OrderedListProps = {
	input: {
		name: "test-field",
		value: "",
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

const className = "list";

describe("<OrderedList />", () => {
	describe("errors", () => {
		it("shows no errors by default", () => {
			const { container } = render(<OrderedList {...mockProps} />);

			expect(container.querySelector(`.${className}__error`)).not.toBeInTheDocument();
		});

		it("shows error on submit", () => {
			const { container } = render(
				<OrderedList
					{...mockProps}
					meta={{
						...mockProps.meta,
						submitFailed: true,
						error: "foo",
					}}
				/>,
			);

			expect(container.querySelector(`.${className}__error`)).toBeInTheDocument();
		});

		it("shows error on changed", () => {
			const { container } = render(
				<OrderedList
					{...mockProps}
					meta={{
						...mockProps.meta,
						dirty: true,
						error: "foo",
					}}
				/>,
			);

			expect(container.querySelector(`.${className}__error`)).toBeInTheDocument();
		});
	});
});
