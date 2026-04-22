import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PillButton from "../PillButton";

describe("<PillButton />", () => {
	it("renders children and handles click", async () => {
		const onClick = vi.fn();
		render(
			<PillButton variant="primary" onClick={onClick}>
				Create protocol
			</PillButton>,
		);
		const btn = screen.getByRole("button", { name: /create protocol/i });
		btn.click();
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("applies primary variant styles", () => {
		render(<PillButton variant="primary">Go</PillButton>);
		const btn = screen.getByRole("button");
		expect(btn).toHaveClass("rounded-full");
		expect(btn).toHaveStyle({ background: "hsl(168 100% 39%)" });
	});

	it("respects disabled", () => {
		render(
			<PillButton variant="primary" disabled>
				Go
			</PillButton>,
		);
		expect(screen.getByRole("button")).toBeDisabled();
	});
});
