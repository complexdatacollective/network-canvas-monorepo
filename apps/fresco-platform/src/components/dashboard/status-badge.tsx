import { cn } from "@codaco/ui";
import type { ContainerStatus, TenantStatus } from "../../lib/dashboard-types";

type StatusBadgeProps = {
	status: TenantStatus | ContainerStatus;
	size?: "sm" | "md";
};

const statusConfig: Record<
	TenantStatus | ContainerStatus,
	{
		label: string;
		className: string;
	}
> = {
	ACTIVE: {
		label: "Active",
		className: "bg-green-100 text-green-800 border-green-200",
	},
	STOPPED: {
		label: "Stopped",
		className: "bg-gray-100 text-gray-800 border-gray-200",
	},
	DEPLOYING: {
		label: "Deploying",
		className: "bg-blue-100 text-blue-800 border-blue-200",
	},
	DESTROYING: {
		label: "Destroying",
		className: "bg-orange-100 text-orange-800 border-orange-200",
	},
	ERROR: {
		label: "Error",
		className: "bg-red-100 text-red-800 border-red-200",
	},
	running: {
		label: "Running",
		className: "bg-green-100 text-green-800 border-green-200",
	},
	stopped: {
		label: "Stopped",
		className: "bg-gray-100 text-gray-800 border-gray-200",
	},
	unknown: {
		label: "Unknown",
		className: "bg-yellow-100 text-yellow-800 border-yellow-200",
	},
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
	const config = statusConfig[status];

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border font-medium",
				config.className,
				size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
			)}
		>
			<span className={cn("mr-1.5 h-2 w-2 rounded-full bg-current", size === "sm" && "h-1.5 w-1.5")} />
			{config.label}
		</span>
	);
}
