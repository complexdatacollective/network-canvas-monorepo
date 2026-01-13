/* eslint-env jest */

import { shallow } from "enzyme";
import React from "react";
import Panels from "../Panel";

describe("Panels component", () => {
	it("renders ok", () => {
		const component = shallow(
			<Panels>
				<span>foo</span>
			</Panels>,
		);

		expect(component).toMatchSnapshot();
	});
});
