import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import ProtocolControlBar from "../ProtocolControlBar";

const mockStore = configureStore({
	reducer: {
		activeProtocol: (state = { present: null, past: [], future: [] }) => state,
	},
});

describe("<ProtocolControlBar />", () => {
	it("can render", () => {
		const { container } = render(
			<Provider store={mockStore}>
				<ProtocolControlBar />
			</Provider>,
		);

		expect(container).toMatchSnapshot();
	});
});
