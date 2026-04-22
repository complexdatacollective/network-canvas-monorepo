import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TimelineRail from "../TimelineRail";

describe("<TimelineRail />", () => {
	it("renders children", () => {
		render(
			<TimelineRail>
				<div data-testid="station-1" />
				<div data-testid="station-2" />
			</TimelineRail>,
		);
		expect(screen.getByTestId("station-1")).toBeInTheDocument();
		expect(screen.getByTestId("station-2")).toBeInTheDocument();
	});

	it("applies a rail background when railColor is provided", () => {
		const { container } = render(<TimelineRail railColor="hsl(168 100% 39%)">x</TimelineRail>);
		const rail = container.querySelector('[data-part="rail"]');
		expect(rail).not.toBeNull();
	});
});
