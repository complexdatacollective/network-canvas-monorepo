import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Date from "../Date";
import DatePicker from "../DatePicker";

describe("<Date>", () => {
	it("can render", () => {
		const mockChild = vi.fn(() => <div>Test</div>);

		const { getByText } = render(
			<DatePicker date="2019-12-09">
				<Date>{mockChild}</Date>
			</DatePicker>,
		);

		expect(getByText("Test")).toBeInTheDocument();
		expect(mockChild).toHaveBeenCalled();
	});
});
