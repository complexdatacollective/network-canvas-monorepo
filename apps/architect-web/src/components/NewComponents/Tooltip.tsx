import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type TooltipProps = {
	content: ReactNode;
	children: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	open?: boolean;
	variant?: "default" | "error";
};

export default function Tooltip({ content, children, side = "top", open, variant = "default" }: TooltipProps) {
	const popupClasses = cx(
		"max-w-sm rounded-sm px-3 py-2 text-sm shadow-lg",
		variant === "default" && "bg-surface-accent text-surface-accent-foreground",
		variant === "error" && "bg-error text-error-foreground",
	);

	return (
		<BaseTooltip.Root open={open}>
			<BaseTooltip.Trigger
				render={
					<span className="inline-flex" tabIndex={0}>
						{children}
					</span>
				}
			/>
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner side={side} sideOffset={8} className="z-(--z-tooltip)">
					<BaseTooltip.Popup className={popupClasses}>{content}</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
