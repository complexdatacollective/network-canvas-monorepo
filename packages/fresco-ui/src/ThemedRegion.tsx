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
	const body = <PortalContainerProvider>{children}</PortalContainerProvider>;

	if (render && isValidElement<HTMLAttributes<HTMLElement>>(render)) {
		return cloneElement(
			render,
			{
				...themeAttr,
				...rest,
				className: cx(render.props.className, className),
			},
			body,
		);
	}

	return (
		<div {...themeAttr} {...rest} className={className}>
			{body}
		</div>
	);
}
