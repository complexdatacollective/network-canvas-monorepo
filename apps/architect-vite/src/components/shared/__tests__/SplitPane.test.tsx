import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SplitPane from "../SplitPane";

describe("<SplitPane />", () => {
	it("renders both left and right slots", () => {
		render(<SplitPane left={<div>PREVIEW</div>} right={<div>EDITOR</div>} />);
		expect(screen.getByText("PREVIEW")).toBeInTheDocument();
		expect(screen.getByText("EDITOR")).toBeInTheDocument();
	});

	it("supports a narrow-viewport toggle", () => {
		render(
			<SplitPane
				left={<div>PREVIEW</div>}
				right={<div>EDITOR</div>}
				narrowPreviewOpen={false}
				onNarrowPreviewToggle={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /preview/i })).toBeInTheDocument();
	});
});
