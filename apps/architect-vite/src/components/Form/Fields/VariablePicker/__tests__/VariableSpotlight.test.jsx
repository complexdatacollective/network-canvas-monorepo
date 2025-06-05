import { render } from "@testing-library/react";
import { noop } from "lodash";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { vi } from "vitest";
import VariableSpotlight from "../VariableSpotlight";

const mockStore = createStore(() => ({
	protocol: { present: {} },
}));

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
		const { container } = render(
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

		const items = container.querySelectorAll(".spotlight-list-item");

		expect(items[0]).toHaveTextContent("Existing Variables");
		expect(items[1]).toHaveTextContent("Just a number");
		expect(items[1].querySelector(".icon")).toHaveAttribute("src", "number-variable.svg");
		expect(items[2]).toHaveTextContent("Name");
		expect(items[2].querySelector(".icon")).toHaveAttribute("src", "text-variable.svg");
	});

	it("typing filters options", () => {
		const handleCancel = vi.fn();
		const handleSelect = vi.fn();
		const handleCreate = vi.fn();

		const subject = mount(
			<Provider store={mockStore}>
				<VariableSpotlight
					onSelect={handleSelect}
					entity=""
					type=""
					onCancel={handleCancel}
					onCreateOption={handleCreate}
					options={[
						{
							value: "b068931cc450442b63f5b3d276ea4297",
							label: "name",
							type: "text",
						},
						{
							value: "7d637d275668ed6d41a9b97e6ad3a556",
							label: "just a number",
							type: "number",
						},
					]}
				/>
			</Provider>,
		);

		const Search = subject.find("Search input");

		let items;

		items = subject.find(".spotlight-list-item");
		expect(items.length).toBe(3);

		Search.simulate("change", { target: { value: "nam" } });
		items = subject.find(".spotlight-list-item");
		expect(items.length).toBe(4);
		expect(items.at(0).text()).toEqual("Create");
		expect(items.at(1).find("span").text()).toEqual('Create new variable called "nam".');
		expect(items.at(2).text()).toEqual('Existing Variables Containing "nam"');
		expect(items.at(3).text()).toEqual("name");
	});

	it("is keyboard navigable", () => {
		const handleCancel = jest.fn();
		const handleSelect = jest.fn();
		const handleCreate = jest.fn();

		const subject = mount(
			<Provider store={mockStore}>
				<VariableSpotlight
					onSelect={handleSelect}
					entity=""
					type=""
					onCancel={handleCancel}
					onCreateOption={handleCreate}
					options={[
						{
							value: "b068931cc450442b63f5b3d276ea4297",
							label: "name",
							type: "text",
						},
						{
							value: "7d637d275668ed6d41a9b97e6ad3a556",
							label: "just a number",
							type: "number",
						},
					]}
				/>
			</Provider>,
		);

		const Search = subject.find("Search input");

		let items;

		Search.simulate("keydown", { key: "ArrowDown" });
		Search.simulate("keydown", { key: "ArrowDown" });
		items = subject.find(".spotlight-list-item");
		expect(items.at(1).hasClass("spotlight-list-item--selected")).toBe(false);
		expect(items.at(2).hasClass("spotlight-list-item--selected")).toBe(true);

		Search.simulate("keydown", { key: "ArrowUp" });
		items = subject.find(".spotlight-list-item");
		expect(items.at(1).hasClass("spotlight-list-item--selected")).toBe(true);
		expect(items.at(2).hasClass("spotlight-list-item--selected")).toBe(false);

		expect(handleCancel.mock.calls.length).toBe(0);
		// This would close the window in actual use, but that's
		// managed by handleCancel and in this case it does nothing.
		Search.simulate("keydown", { key: "Escape" });
		expect(handleCancel.mock.calls.length).toBe(1);

		expect(handleSelect.mock.calls.length).toBe(0);
		// Currently selected variable from keyboard navigation above
		Search.simulate("keydown", { key: "Enter" });
		expect(handleSelect.mock.calls).toEqual([["7d637d275668ed6d41a9b97e6ad3a556"]]);

		expect(handleCreate.mock.calls.length).toBe(0);
		Search.simulate("change", { target: { value: "nam" } });
		// 0: create divider
		// 1: create new "nam" variable
		// 2: filter divider
		// 3: select "name" variable
		Search.simulate("keydown", { key: "ArrowUp" });
		items = subject.find(".spotlight-list-item");
		expect(items.at(1).hasClass("spotlight-list-item--selected")).toBe(true);
		Search.simulate("keydown", { key: "Enter" });
		expect(handleCreate.mock.calls).toEqual([["nam"]]);
	});
});
