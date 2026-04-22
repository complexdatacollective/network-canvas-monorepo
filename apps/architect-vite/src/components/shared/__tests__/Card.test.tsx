import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Card from "../Card";

describe("<Card />", () => {
	it("renders children with card styles", () => {
		render(<Card>content</Card>);
		const el = screen.getByText("content");
		expect(el).not.toBeNull();
		expect(el).toHaveClass("bg-white");
		expect(el.getAttribute("style")).toContain("rgba(22,21,43,0.08)");
	});

	it("accepts padding prop", () => {
		render(
			<Card padding="lg" data-testid="card">
				x
			</Card>,
		);
		expect(screen.getByTestId("card")).toHaveClass("p-8");
	});
});
