import { describe, expect, it } from "vitest";
/* eslint-disable react/jsx-props-no-spreading */

import { render } from "@testing-library/react";
import Zoom from "../Zoom";

const mockProps = {};

describe("<Zoom />", () => {
	it("can render", () => {
		const { container } = render(<Zoom {...mockProps}>Foo</Zoom>);
		expect(container.firstChild).toBeInTheDocument();
	});
});
