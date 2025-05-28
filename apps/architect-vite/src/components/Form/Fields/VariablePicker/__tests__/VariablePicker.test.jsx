import { describe, it, expect, vi, beforeAll } from "vitest";

import React from "react";
import { render } from "@testing-library/react";
import { noop } from "lodash";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import VariablePicker from "../VariablePicker";

// Mock the components that VariablePicker renders
vi.mock("../VariablePill", () => ({
	default: () => <div data-testid="editable-variable-pill">EditableVariablePill</div>,
	SimpleVariablePill: () => <div data-testid="simple-variable-pill">SimpleVariablePill</div>
}));

vi.mock("~/lib/legacy-ui/components", () => ({
	Button: ({ children, ...props }) => <button {...props}>{children}</button>
}));

vi.mock("../SpotlightModal", () => ({
	default: () => <div data-testid="spotlight-modal">SpotlightModal</div>
}));

vi.mock("../VariableSpotlight", () => ({
	default: () => <div data-testid="variable-spotlight">VariableSpotlight</div>
}));

const mockStore = configureStore({
	reducer: {
		protocol: () => ({
			present: {
				codebook: {
					node: {
						person: {
							variables: {
								age: {},
							},
						},
					},
					edge: {},
					ego: {},
				},
			},
		}),
	},
});

describe("VariablePicker", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("when no variable is selected it renders the select variable button", () => {
		const { getByText } = render(
			<Provider store={mockStore}>
				<VariablePicker
					entity=""
					type=""
					label=""
					options={
						[
							// {label, value, type}
						]
					}
					meta={{}}
					input={{
						value: "",
						onChange: noop,
					}}
					onCreateOption={noop}
				/>
			</Provider>,
		);

		expect(getByText("Select Variable")).toBeInTheDocument();
	});

	it("when selected variable has type it renders the EditableVariablePill", () => {
		const { getByText, getByTestId } = render(
			<Provider store={mockStore}>
				<VariablePicker
					entity=""
					type=""
					label=""
					options={[
						{
							label: "Just a number",
							value: "age",
							type: "number",
						},
					]}
					meta={{}}
					input={{
						value: "age",
						onChange: noop,
					}}
					onCreateOption={noop}
				/>
			</Provider>,
		);

		expect(getByText("Change Variable")).toBeInTheDocument();
		expect(getByTestId("editable-variable-pill")).toBeInTheDocument();
	});

	it("when selected has no type it renders the SimpleVariablePill", () => {
		const { getByText, getByTestId } = render(
			<Provider store={mockStore}>
				<VariablePicker
					entity=""
					type=""
					label=""
					options={[
						{
							label: "Just a number",
							value: "age",
						},
					]}
					meta={{}}
					input={{
						value: "age",
						onChange: noop,
					}}
					onCreateOption={noop}
				/>
			</Provider>,
		);

		expect(getByText("Change Variable")).toBeInTheDocument();
		expect(getByTestId("simple-variable-pill")).toBeInTheDocument();
	});
});
