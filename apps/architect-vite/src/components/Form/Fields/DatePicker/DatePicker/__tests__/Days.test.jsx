import { describe, it, expect, vi } from "vitest";

import { render } from "@testing-library/react";
import DatePicker from "../DatePicker";
import Days from "../Days";

describe("<Days>", () => {
	it("can render", () => {
		const mockChild = vi.fn(() => <div>Days Test</div>);

		const { getByText } = render(
			<DatePicker date="2019-12-09">
				<Days>{mockChild}</Days>
			</DatePicker>,
		);

		expect(getByText("Days Test")).toBeInTheDocument();
		expect(mockChild).toHaveBeenCalled();
	});
});
