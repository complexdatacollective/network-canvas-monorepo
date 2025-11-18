import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DatePicker from "../DatePicker";
import Years from "../Years";

describe("<Years>", () => {
	it("can render", () => {
		const mockChild = vi.fn(() => <div>Years Test</div>);

		const { getByText } = render(
			<DatePicker date="2019-12-09">
				<Years>{mockChild}</Years>
			</DatePicker>,
		);

		expect(getByText("Years Test")).toBeInTheDocument();
		expect(mockChild).toHaveBeenCalled();
	});
});
