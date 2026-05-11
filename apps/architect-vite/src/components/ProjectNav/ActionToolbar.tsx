import type React from "react";
import { cn } from "~/utils/cn";

type ActionToolbarProps = {
	children: React.ReactNode;
	banner?: React.ReactNode;
	className?: string;
	"aria-label"?: string;
};

const ActionToolbar = ({
	children,
	banner,
	className,
	"aria-label": ariaLabel = "Page actions",
}: ActionToolbarProps) => (
	<div className="fixed inset-x-0 bottom-6 z-(--z-global-ui) px-4 sm:px-6 pointer-events-none print:hidden">
		<div className="max-w-7xl mx-auto flex justify-end">
			<div className="pointer-events-auto bg-fresco-purple text-white shadow-lg rounded-2xl overflow-hidden">
				{banner}
				<div
					role="toolbar"
					aria-label={ariaLabel}
					className={cn("flex items-center gap-(--space-sm) px-3 py-2", className)}
				>
					{children}
				</div>
			</div>
		</div>
	</div>
);

export default ActionToolbar;
