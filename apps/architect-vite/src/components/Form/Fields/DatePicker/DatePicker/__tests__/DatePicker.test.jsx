import { describe, it, expect, vi } from "vitest";

import { render } from "@testing-library/react";
import DatePicker from "../DatePicker";

describe("<DatePicker>", () => {
	it("can render", () => {
		const mockChild = vi.fn(() => <div>DatePicker Test</div>);

		const { getByText } = render(<DatePicker date="2019-12-09">{mockChild}</DatePicker>);

		expect(getByText("DatePicker Test")).toBeInTheDocument();
		expect(mockChild).toHaveBeenCalled();
	});
});
