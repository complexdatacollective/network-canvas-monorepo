import { describe, it, expect } from "vitest";

import { render } from "@testing-library/react";
import IconOption from "../IconOption";

const mockProps = {
	label: "add-a-person",
	input: {},
};

describe("<IconOption />", () => {
	it("can render", () => {
		const { container } = render(<IconOption {...mockProps} />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
