import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
