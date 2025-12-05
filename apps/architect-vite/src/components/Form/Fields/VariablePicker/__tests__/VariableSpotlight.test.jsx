import { render } from "@testing-library/react";
import { noop } from "lodash";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { vi } from "vitest";
import VariableSpotlight from "../VariableSpotlight";

const mockStore = createStore(() => ({
	activeProtocol: { present: { codebook: { node: {}, edge: {}, ego: {} } } },
}));

describe("VariableSpotlight", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("when options is empty it renders the empty message", () => {
		const { baseElement } = render(
			<Provider store={mockStore}>
				<VariableSpotlight
					open={true}
					onOpenChange={noop}
					onSelect={noop}
					entity=""
					type=""
					onCancel={noop}
					onCreateOption={noop}
					options={[]}
				/>
			</Provider>,
		);

		expect(baseElement.querySelector(".variable-spotlight__empty")).toBeInTheDocument();
	});

	it("it renders options", () => {
		const { baseElement } = render(
			<Provider store={mockStore}>
				<VariableSpotlight
					open={true}
					onOpenChange={noop}
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

		const items = baseElement.querySelectorAll(".spotlight-list-item");

		expect(items[0]).toHaveTextContent("Existing Variables");
		expect(items[1]).toHaveTextContent("Just a number");
		expect(items[1].querySelector(".icon")).toBeInTheDocument();
		expect(items[2]).toHaveTextContent("Name");
		expect(items[2].querySelector(".icon")).toBeInTheDocument();
	});
});
