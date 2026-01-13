/* eslint-env jest */

import { mount } from "enzyme";
import React from "react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import testState from "../../__tests__/testState.json" with { type: "json" };
import ProtocolControlBar from "../ProtocolControlBar";

const mockProps = {
	saveProtocol: () => {},
	isSaving: false,
	isDisabled: false,
	showControlBar: true,
	hasUnsavedChanges: false,
	hasAnyStages: true,
	handleClickStart: () => {},
};

const mockStore = createStore(() => testState);

describe("<ProtocolControlBar />", () => {
	it("can render", () => {
		const component = mount(
			<Provider store={mockStore}>
				<ProtocolControlBar {...mockProps} />
			</Provider>,
		);

		expect(component.html()).toMatchSnapshot();
	});
});
