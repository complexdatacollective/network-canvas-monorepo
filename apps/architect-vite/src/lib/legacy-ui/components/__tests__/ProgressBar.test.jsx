import { describe, it, expect } from "vitest";

import { render } from "@testing-library/react";
import ProgressBar from "../ProgressBar";

describe("ProgressBar component", () => {
	it("renders ProgressBar", () => {
		const { container } = render(<ProgressBar percentProgress="40" />);

		expect(container.firstChild).toBeInTheDocument();
	});
});
