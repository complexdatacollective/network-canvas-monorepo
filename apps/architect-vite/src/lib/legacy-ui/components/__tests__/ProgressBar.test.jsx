import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProgressBar from "../ProgressBar";

describe("ProgressBar component", () => {
	it("renders ProgressBar", () => {
		const { container } = render(<ProgressBar percentProgress="40" />);

		expect(container.firstChild).toBeInTheDocument();
	});
});
