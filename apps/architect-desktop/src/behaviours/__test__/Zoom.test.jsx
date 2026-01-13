/* eslint-env jest */
/* eslint-disable react/jsx-props-no-spreading */

import { shallow } from "enzyme";
import React from "react";
import Zoom from "../Zoom";

const mockProps = {};

describe("<Zoom />", () => {
	it("can render", () => {
		shallow(<Zoom {...mockProps}>Foo</Zoom>);
	});
});
