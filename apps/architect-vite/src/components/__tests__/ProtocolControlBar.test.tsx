import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import testState from "../../__tests__/testState.json";
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
		const { container } = render(
			<Provider store={mockStore}>
				<ProtocolControlBar {...mockProps} />
			</Provider>,
		);

		expect(container).toMatchSnapshot();
	});
});
