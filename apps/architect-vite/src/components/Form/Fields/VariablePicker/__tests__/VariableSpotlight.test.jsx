import { describe, it, expect, beforeAll, vi } from "vitest";

import { render } from "@testing-library/react";
import { noop } from "lodash";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import VariableSpotlight from "../VariableSpotlight";

const mockStore = configureStore({
	reducer: {
		protocol: () => ({ present: {} }),
	},
});

describe("VariableSpotlight", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("when options is empty it renders the empty message", () => {
		const { container } = render(
			<Provider store={mockStore}>
				<VariableSpotlight onSelect={noop} entity="" type="" onCancel={noop} onCreateOption={noop} options={[]} />
			</Provider>,
		);

		expect(container.querySelector(".variable-spotlight__empty")).toBeInTheDocument();
	});

	it("it renders options", () => {
		const { getByText } = render(
			<Provider store={mockStore}>
				<VariableSpotlight
					onSelect={noop}
					entity=""
					type=""
					onCancel={noop}
					onCreateOption={noop}
					options={[
						{
							value: "name",
							label: "Name",
							type: "text",
						},
						{
							value: "age",
							label: "Just a number",
							type: "number",
						},
					]}
				/>
			</Provider>,
		);

		expect(getByText("Existing Variables")).toBeInTheDocument();
		expect(getByText("Just a number")).toBeInTheDocument();
		expect(getByText("Name")).toBeInTheDocument();
	});
});
