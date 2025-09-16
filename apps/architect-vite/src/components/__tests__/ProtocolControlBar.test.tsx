import { describe, it, expect } from "vitest";

import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import ProtocolControlBar from "../ProtocolControlBar";
import testState from "../../__tests__/testState.json";

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
		const { container } = render(
			<Provider store={mockStore}>
				<ProtocolControlBar {...mockProps} />
			</Provider>,
		);

		expect(container).toMatchSnapshot();
	});
});
