import { describe, it, expect } from "vitest";

import { render } from "@testing-library/react";
import Field from "../Field";

describe("Slider Field", () => {
	it("can render", () => {
		const { container } = render(<Field min={0} max={100} value={50} onChange={() => {}} />);

		expect(container.firstChild).toBeInTheDocument();
	});
});
