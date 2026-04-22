import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimelineStation from "../TimelineStation";

describe("<TimelineStation />", () => {
	it("renders label and index", () => {
		render(
			<TimelineStation
				label="Introduction"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
			/>,
		);
		expect(screen.getByText("Introduction")).toBeInTheDocument();
		expect(screen.getByText("01")).toBeInTheDocument();
	});

	it("does not render a delete button when onDelete is not provided", () => {
		render(
			<TimelineStation
				label="Introduction"
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
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="right"
				hasSkipLogic
			/>,
		);
		expect(screen.getByAltText("Skip logic")).toBeInTheDocument();
	});
});
