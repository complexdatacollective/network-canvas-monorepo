import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DateComponent from "../DateComponent";
import DatePicker from "../DatePicker";

describe("<DateComponent>", () => {
	it("can render", () => {
		const mockChild = vi.fn(() => <div>Test</div>);

		const { getByText } = render(
			<DatePicker date="2019-12-09">
				<DateComponent>{mockChild}</DateComponent>
			</DatePicker>,
		);

		expect(getByText("Test")).toBeInTheDocument();
		expect(mockChild).toHaveBeenCalled();
	});
});
