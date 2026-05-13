import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePortalContainer } from "./PortalContainer";
import { ThemedRegion } from "./ThemedRegion";

describe("ThemedRegion", () => {
	it("renders a div with data-theme-interview and scheme-dark when theme=interview", () => {
		const { container } = render(
			<ThemedRegion theme="interview">
				<span data-testid="child">hello</span>
			</ThemedRegion>,
		);

		const wrapper = container.firstElementChild;
		expect(wrapper).not.toBeNull();
		expect(wrapper?.tagName).toBe("DIV");
		expect(wrapper?.hasAttribute("data-theme-interview")).toBe(true);
		expect(wrapper).toHaveClass("scheme-dark");
		expect(screen.getByTestId("child")).toHaveTextContent("hello");
	});

	it("forwards className and other HTML props to the wrapper", () => {
		const { container } = render(
			<ThemedRegion theme="interview" className="custom-class" id="region">
				<span />
			</ThemedRegion>,
		);

		const wrapper = container.firstElementChild;
		expect(wrapper).toHaveClass("custom-class");
		expect(wrapper).toHaveClass("scheme-dark");
		expect(wrapper).toHaveAttribute("id", "region");
	});

	it("supports the render prop for tag polymorphism", () => {
		const { container } = render(
			<ThemedRegion theme="interview" render={<main className="shell" />}>
				<span data-testid="child" />
			</ThemedRegion>,
		);

		const wrapper = container.firstElementChild;
		expect(wrapper?.tagName).toBe("MAIN");
		expect(wrapper?.hasAttribute("data-theme-interview")).toBe(true);
		expect(wrapper).toHaveClass("shell");
		expect(wrapper).toHaveClass("scheme-dark");
		expect(screen.getByTestId("child")).toBeInTheDocument();
	});

	it("provides a portal container to descendants via context", () => {
		const { result } = renderHook(() => usePortalContainer(), {
			wrapper: ({ children }) => <ThemedRegion theme="interview">{children}</ThemedRegion>,
		});

		expect(result.current).toBeInstanceOf(HTMLElement);
	});
});
