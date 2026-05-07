"use client";

import { cloneElement, type HTMLAttributes, isValidElement, type ReactElement, type ReactNode } from "react";
import { PortalContainerProvider } from "./PortalContainer";
import { cx } from "./utils/cva";

type ThemedRegionProps = {
	theme: "interview";
	children: ReactNode;
	className?: string;
	render?: ReactElement;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">;

export function ThemedRegion({ theme, render, children, className, ...rest }: ThemedRegionProps) {
	const themeAttr = theme === "interview" ? { "data-theme-interview": "" } : {};
	// Interview is a dark-only palette; apply Tailwind's `scheme-dark` utility
	// (color-scheme: dark) so native UI inside the region — form controls,
	// scrollbars, autofill backgrounds — matches the themed surface.
	const themeClass = theme === "interview" ? "scheme-dark" : null;
	const body = <PortalContainerProvider>{children}</PortalContainerProvider>;

	if (render && isValidElement<HTMLAttributes<HTMLElement>>(render)) {
		return cloneElement(
			render,
			{
				...themeAttr,
				...rest,
				className: cx(themeClass, render.props.className, className),
			},
			body,
		);
	}

	return (
		<div {...themeAttr} {...rest} className={cx(themeClass, className)}>
			{body}
		</div>
	);
}
