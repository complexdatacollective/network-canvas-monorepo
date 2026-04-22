import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TimelineRail from "../TimelineRail";

describe("<TimelineRail />", () => {
	it("renders children in a vertical flex column", () => {
		const { container } = render(
			<TimelineRail>
				<div data-testid="station-1" />
				<div data-testid="station-2" />
			</TimelineRail>,
		);
		expect(screen.getByTestId("station-1")).toBeInTheDocument();
		expect(screen.getByTestId("station-2")).toBeInTheDocument();
		const root = container.firstElementChild;
		expect(root?.className).toContain("flex");
		expect(root?.className).toContain("flex-col");
	});
});
