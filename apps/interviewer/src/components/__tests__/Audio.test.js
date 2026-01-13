/* eslint-env jest */
/* eslint-disable @codaco/spellcheck/spell-checker */

import { shallow } from "enzyme";
import React from "react";
import { Audio } from "../Audio";

const mockProps = {
	url: "foo",
	description: "bar",
	miscellaneousAdditionalProperty: "baz",
};

describe("<Audio />", () => {
	it("renders ok", () => {
		const component = shallow(<Audio {...mockProps} />);

		expect(component).toMatchSnapshot();
	});
});
