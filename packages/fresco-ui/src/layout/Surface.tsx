"use client";

import { motion } from "motion/react";
import { type ElementType, forwardRef } from "react";
import { compose, cva, cx, type VariantProps } from "../utils/cva";
import ResponsiveContainer, { type ResponsiveContainerProps } from "./ResponsiveContainer";

export const surfaceSpacingVariants = cva({
	base: "",
	variants: {
		section: {
			header: "pb-0!",
			content: "py-0!",
			footer: "pt-0!",
			container: "",
		},
		spacing: {
			none: "",
			xs: "px-4 py-3",
			sm: "px-6 py-4",
			md: "px-8 py-6",
			lg: "px-10 py-8",
			xl: "px-12 py-10",
		},
	},
	defaultVariants: {
		spacing: "md",
		section: "container",
	},
});

export const surfaceVariants = compose(
	surfaceSpacingVariants,
	cva({
		// `overflow-clip` (not `overflow-hidden`) so Surface never becomes a
		// programmatic scroll container. `overflow-hidden` still allows
		// `scrollIntoView`/focus auto-scroll to move a descendant into view by
		// scrolling the Surface itself, which in dialogs pushes the header off
		// screen when content exceeds the clipped area.
		base: "publish-colors relative overflow-clip rounded",
		variants: {
			level: {
				0: "text-surface-contrast bg-surface",
				1: "text-surface-1-contrast bg-surface-1",
				2: "text-surface-2-contrast bg-surface-2",
				3: "text-surface-3-contrast bg-surface-3",
				popover: "text-surface-popover-contrast bg-surface-popover [--focus-color:white]",
			},
			spacing: {
				none: "",
				xs: "shadow-sm",
				sm: "shadow",
				md: "shadow-md",
				lg: "shadow-lg",
				xl: "shadow-xl",
			},
		},
		defaultVariants: {
			level: 0,
		},
	}),
);

export type SurfaceVariants = VariantProps<typeof surfaceVariants>;

type SurfaceProps<T extends ElementType = "div"> = {
	as?: T;
	noContainer?: boolean;
} & SurfaceVariants &
	ResponsiveContainerProps &
	Omit<
		React.ComponentPropsWithoutRef<T>,
		keyof SurfaceVariants | keyof ResponsiveContainerProps | "as" | "noContainer"
	>;

/**
 * Surface is a layout component that provides a background and foreground color
 * and allows for spacing to be applied. It is intended to be used as a container
 * to construct hierarchical layouts, and is explicitly designed to support
 * being nested.
 *
 * Implementation note: Uses a ::before pseudo-element for the background layer
 * to ensure elevation shadows correctly reference the parent's background color
 * while keeping a single DOM element for clean layout control.
 *
 * To override the background color, use `before:bg-*` classes in className:
 * <Surface className="before:bg-primary text-primary-contrast">
 */
const SurfaceComponent = forwardRef<HTMLDivElement, SurfaceProps>(
	({ as, children, level, spacing, section, className, maxWidth, baseSize, noContainer = false, ...rest }, ref) => {
		const Component = as ?? "div";
		const surfaceElement = (
			<Component
				ref={ref}
				{...rest}
				className={cx(
					surfaceVariants({
						level,
						spacing,
						section,
					}),
					className,
				)}
			>
				{children}
			</Component>
		);

		if (noContainer) {
			return surfaceElement;
		}

		return (
			<ResponsiveContainer maxWidth={maxWidth} baseSize={baseSize}>
				{surfaceElement}
			</ResponsiveContainer>
		);
	},
);

SurfaceComponent.displayName = "Surface";

const Surface = SurfaceComponent as <T extends ElementType = "div">(
	props: SurfaceProps<T> & { ref?: React.Ref<HTMLElement> },
) => React.ReactElement | null;

export default Surface;

export const MotionSurface = motion.create(Surface);
