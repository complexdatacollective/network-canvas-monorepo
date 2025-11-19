import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnconnectedRecentProtocols } from "../RecentProtocols";

const mockProps = {
	recentProtocols: [],
};

describe("<RecentProtocols />", () => {
	it("can render?", () => {
		const { container } = render(<UnconnectedRecentProtocols {...mockProps} />);

		expect(container).toMatchSnapshot();
	});
});
