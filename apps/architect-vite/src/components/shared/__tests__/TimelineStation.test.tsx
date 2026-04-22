import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimelineStation from "../TimelineStation";

describe("<TimelineStation />", () => {
	it("renders label, sub-label and index", () => {
		render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
			/>,
		);
		expect(screen.getByText("Introduction")).toBeInTheDocument();
		expect(screen.getByText("Information screen")).toBeInTheDocument();
		expect(screen.getByText("01")).toBeInTheDocument();
	});

	it("does not render a delete button when onDelete is not provided", () => {
		render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
			/>,
		);
		expect(screen.queryByRole("button", { name: "Delete stage" })).toBeNull();
	});

	it("renders a delete button when onDelete is provided", () => {
		const onDelete = vi.fn();
		render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
				onDelete={onDelete}
			/>,
		);
		expect(screen.getByRole("button", { name: "Delete stage" })).toBeInTheDocument();
	});

	it("renders the filter icon when hasFilter is true", () => {
		render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
				hasFilter
			/>,
		);
		expect(screen.getByAltText("Filter")).toBeInTheDocument();
	});

	it("renders the skip-logic icon when hasSkipLogic is true", () => {
		render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
				hasSkipLogic
			/>,
		);
		expect(screen.getByAltText("Skip logic")).toBeInTheDocument();
	});

	it("renders an incoming rail segment with the provided color", () => {
		const { container } = render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={1}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
				incomingRailColor="rgb(104, 111, 237)"
			/>,
		);
		const segment = container.querySelector('[aria-hidden="true"]');
		expect(segment).not.toBeNull();
		// jsdom normalizes color values, so we check the serialized inline style
		// contains the color we passed in (rgb form so the comparison is stable).
		expect(segment?.getAttribute("style")).toContain("rgb(104, 111, 237)");
	});

	it("does not render an incoming rail segment when incomingRailColor is omitted", () => {
		const { container } = render(
			<TimelineStation
				label="Introduction"
				subLabel="Information screen"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
			/>,
		);
		expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
	});
});
