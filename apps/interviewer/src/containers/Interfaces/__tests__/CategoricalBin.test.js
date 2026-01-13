/* eslint-disable @codaco/spellcheck/spell-checker */

import { shallow } from "enzyme";
import React from "react";
import { vi } from "vitest";
import { UnconnectedCategoricalBin as CategoricalBin } from "../CategoricalBin";

const requiredProps = {
	nodesForPrompt: [],
	prompt: {},
	stage: {},
	promptBackward: vi.fn(),
	promptForward: vi.fn(),
};

describe("CategoricalBin", () => {
	it("renders CategoricalBin interface", () => {
		const component = shallow(<CategoricalBin {...requiredProps} />);
		expect(component).toMatchSnapshot();
	});
});
