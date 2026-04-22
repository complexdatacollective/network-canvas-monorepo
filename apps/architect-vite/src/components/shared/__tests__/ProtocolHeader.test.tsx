import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProtocolHeader from "../ProtocolHeader";

describe("<ProtocolHeader />", () => {
	it("renders protocol name in the breadcrumb", () => {
		render(<ProtocolHeader protocolName="MyProtocol" />);
		expect(screen.getByText("MyProtocol")).toBeInTheDocument();
	});

	it("renders subsection after a separator when provided", () => {
		render(<ProtocolHeader protocolName="MyProtocol" subsection="Assets" />);
		expect(screen.getByText("Assets")).toBeInTheDocument();
	});

	it("renders action slot on the right", () => {
		render(<ProtocolHeader protocolName="P" actions={<button type="button">Save</button>} />);
		expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
	});

	it("calls onLogoClick when logo is clicked", () => {
		const onLogoClick = vi.fn();
		render(<ProtocolHeader protocolName="P" onLogoClick={onLogoClick} />);
		screen.getByRole("button", { name: /architect home/i }).click();
		expect(onLogoClick).toHaveBeenCalledOnce();
	});
});
