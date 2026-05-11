import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

type TooltipProps = {
	content: ReactNode;
	children: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
};

export default function Tooltip({ content, children, side = "top" }: TooltipProps) {
	return (
		<BaseTooltip.Root>
			<BaseTooltip.Trigger
				render={
					<span className="inline-flex" tabIndex={0}>
						{children}
					</span>
				}
			/>
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner side={side} sideOffset={8} className="z-(--z-tooltip)">
					<BaseTooltip.Popup className="max-w-sm rounded-sm bg-surface-accent px-3 py-2 text-sm text-surface-accent-foreground shadow-lg">
						{content}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
