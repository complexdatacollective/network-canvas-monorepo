import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TimelineSegment from "../TimelineSegment";

describe("<TimelineSegment />", () => {
	it("renders an insert button that fires onInsert", () => {
		const onInsert = vi.fn();
		render(<TimelineSegment onInsert={onInsert} />);
		const btn = screen.getByRole("button", { name: /insert stage here/i });
		btn.click();
		expect(onInsert).toHaveBeenCalledOnce();
	});

	it("renders the colored rail when railColor is provided", () => {
		const { container } = render(<TimelineSegment railColor="rgb(104, 111, 237)" onInsert={() => {}} />);
		const rail = container.querySelector('[aria-hidden="true"]');
		expect(rail).not.toBeNull();
		expect(rail?.getAttribute("style")).toContain("rgb(104, 111, 237)");
	});

	it("does not render the rail when railColor is omitted", () => {
		const { container } = render(<TimelineSegment onInsert={() => {}} />);
		expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
	});
});
