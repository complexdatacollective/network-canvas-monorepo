import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "../Badge";

describe("<Badge />", () => {
	it("renders children", () => {
		render(<Badge color="hsl(168 100% 26%)">web</Badge>);
		expect(screen.getByText("web")).toBeInTheDocument();
	});

	it("applies uppercase tracked styles", () => {
		render(<Badge color="hsl(168 100% 26%)">web</Badge>);
		const el = screen.getByText("web");
		expect(el).toHaveClass("uppercase");
		expect(el).toHaveClass("font-bold");
	});
});
