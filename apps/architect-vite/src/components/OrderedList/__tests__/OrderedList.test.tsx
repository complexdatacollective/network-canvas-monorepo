import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderedList } from "../OrderedList";

const mockProps = {
	input: {
		value: "",
	},
	form: "form",
	item: () => {},
	disabled: false,
};

const className = "list";

describe("<OrderedList />", () => {
	describe("errors", () => {
		it("shows no errors by default", () => {
			const props = {
				meta: {
					dirty: false,
					submitFailed: false,
					error: null,
				},
			};
			const { container } = render(<OrderedList {...mockProps} {...props} />);

			expect(container.querySelector(`.${className}__error`)).not.toBeInTheDocument();
		});

		it("shows error on submit", () => {
			const props = {
				meta: {
					submitFailed: true,
					error: "foo",
				},
			};
			const { container } = render(<OrderedList {...mockProps} {...props} />);

			expect(container.querySelector(`.${className}__error`)).toBeInTheDocument();
		});

		it("shows error on changed", () => {
			const props = {
				meta: {
					dirty: true,
					error: "foo",
				},
			};
			const { container } = render(<OrderedList {...mockProps} {...props} />);

			expect(container.querySelector(`.${className}__error`)).toBeInTheDocument();
		});
	});
});
