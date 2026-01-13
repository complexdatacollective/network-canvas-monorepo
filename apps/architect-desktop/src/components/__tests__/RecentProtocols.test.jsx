/* eslint-env jest */

import { shallow } from "enzyme";
import React from "react";
import { UnconnectedRecentProtocols } from "../RecentProtocols";

const mockProps = {
	recentProtocols: [],
};

describe("<RecentProtocols />", () => {
	it("can render?", () => {
		const component = shallow(<UnconnectedRecentProtocols {...mockProps} />);

		expect(component).toMatchSnapshot();
	});
});
