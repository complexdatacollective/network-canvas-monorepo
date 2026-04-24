import type React from "react";
import { cn } from "~/utils/cn";

type Shape = "pill" | "card";

type FloatingSurfaceProps = React.HTMLAttributes<HTMLElement> & {
	shape: Shape;
	shapeSm?: Shape;
	as?: "div" | "nav" | "section" | "aside";
};

const shapeClasses: Record<Shape, string> = {
	pill: "rounded-full shadow-sm px-4 py-2",
	card: "rounded-2xl shadow-md p-6",
};

const shapeSmClasses: Record<Shape, string> = {
	pill: "sm:rounded-full sm:shadow-sm sm:px-4 sm:py-2",
	card: "sm:rounded-2xl sm:shadow-md sm:p-6",
};

const FloatingSurface = ({
	shape,
	shapeSm,
	as: Component = "div",
	className,
	children,
	...rest
}: FloatingSurfaceProps) => {
	const classes = cn(
		"bg-surface-1 text-surface-1-foreground",
		shapeClasses[shape],
		shapeSm && shapeSmClasses[shapeSm],
		className,
	);

	return (
		<Component className={classes} {...rest}>
			{children}
		</Component>
	);
};

export default FloatingSurface;
