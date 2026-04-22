import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TimelineStation from "../TimelineStation";

describe("<TimelineStation />", () => {
	it("renders label and index", () => {
		render(
			<TimelineStation
				label="Introduction"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="below"
			/>,
		);
		expect(screen.getByText("Introduction")).toBeInTheDocument();
		expect(screen.getByText("01")).toBeInTheDocument();
	});
});
