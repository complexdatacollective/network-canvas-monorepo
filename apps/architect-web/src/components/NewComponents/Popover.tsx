import { Popover as BasePopover } from "@base-ui/react/popover";
import { type ComponentProps, cloneElement, isValidElement, type ReactNode } from "react";
import { cx } from "~/utils/cva";

export const Popover = BasePopover.Root;

type PopoverTriggerProps = ComponentProps<typeof BasePopover.Trigger> & {
	asChild?: boolean;
};

function isButtonElement(el: React.ReactElement): boolean {
	if (typeof el.type === "string") return el.type === "button";
	const t = el.type as { displayName?: string; name?: string };
	return /button/i.test(t.displayName ?? t.name ?? "");
}

export function PopoverTrigger({ children, asChild, nativeButton, ...props }: PopoverTriggerProps) {
	if (asChild && isValidElement<Record<string, unknown>>(children)) {
		// A NAMED FUNCTION EXPRESSION with a lowercase name. Base UI's
		// `warnIfRenderPropLooksLikeComponent` reads `renderFn.name` and warns
		// if the first character is uppercase — to catch people accidentally
		// writing `render={Component}`. An arrow function assigned to a
		// `const` inside `PopoverTrigger` ends up with a compound `.name` like
		// `PopoverTrigger[renderTrigger]` (depending on engine / bundler),
		// which starts with `P` and trips the warning. A named function
		// expression forces the `.name` unconditionally.
		const renderTriggerFn = function renderTrigger(
			triggerProps: React.HTMLAttributes<Element> & { ref?: React.Ref<Element> },
		) {
			return cloneElement(children, {
				...children.props,
				...triggerProps,
			} as Parameters<typeof cloneElement>[1]);
		};

		return (
			<BasePopover.Trigger
				nativeButton={nativeButton ?? isButtonElement(children)}
				render={renderTriggerFn}
				{...props}
			/>
		);
	}

	return (
		<BasePopover.Trigger nativeButton={nativeButton} {...props}>
			{children}
		</BasePopover.Trigger>
	);
}

type PopoverContentProps = Omit<ComponentProps<typeof BasePopover.Popup>, "className"> & {
	className?: string;
	children: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	sideOffset?: number;
};

export function PopoverContent({
	children,
	side = "top",
	align = "center",
	sideOffset = 8,
	className,
	...props
}: PopoverContentProps) {
	return (
		<BasePopover.Portal>
			<BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-(--z-tooltip)">
				<BasePopover.Popup
					className={cx("flex max-h-[80vh] flex-col overflow-hidden rounded-sm shadow-lg", className)}
					{...props}
				>
					{children}
				</BasePopover.Popup>
			</BasePopover.Positioner>
		</BasePopover.Portal>
	);
}
