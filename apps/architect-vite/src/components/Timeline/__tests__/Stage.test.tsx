import { render } from "@testing-library/react";
import { v4 as uuid } from "uuid";
import { describe, expect, it, vi } from "vitest";
import { UnconnectedStage } from "../Stage";

vi.mock("~/lib/legacy-ui/utils/CSSVariables");

const mockProps = {
	id: uuid(),
	stageNumber: 1,
	type: "Foo",
	onEditStage: () => {},
	onDeleteStage: () => {},
	onEditSkipLogic: () => {},
	onInsertStage: () => {},
};

describe("<Stage />", () => {
	it("can render", () => {
		const { container } = render(<UnconnectedStage {...mockProps} />);

		expect(container.firstChild).toBeInTheDocument();
	});
});
