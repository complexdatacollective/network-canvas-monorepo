import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DatePicker from "../DatePicker";

describe("<DatePicker>", () => {
	it("can render", () => {
		const { getByText } = render(
			<DatePicker date="2019-12-09">
				<div>DatePicker Test</div>
			</DatePicker>,
		);

		expect(getByText("DatePicker Test")).toBeInTheDocument();
	});
});
