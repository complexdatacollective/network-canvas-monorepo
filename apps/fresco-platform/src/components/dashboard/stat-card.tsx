import { cn } from "@codaco/ui";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
	title: string;
	value: string | number;
	description?: string;
	icon?: LucideIcon;
	trend?: {
		value: number;
		isPositive: boolean;
	};
	className?: string;
};

export function StatCard({ title, value, description, icon: Icon, trend, className }: StatCardProps) {
	return (
		<div className={cn("rounded-lg border bg-white p-6 shadow-sm", className)}>
			<div className="flex items-start justify-between">
				<div className="flex-1">
					<p className="text-sm font-medium text-gray-600">{title}</p>
					<p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
					{description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
					{trend && (
						<div className="mt-2 flex items-center gap-1">
							<span className={cn("text-sm font-medium", trend.isPositive ? "text-green-600" : "text-red-600")}>
								{trend.isPositive ? "+" : ""}
								{trend.value}%
							</span>
							<span className="text-sm text-gray-500">from last month</span>
						</div>
					)}
				</div>
				{Icon && (
					<div className="rounded-lg bg-primary/10 p-3">
						<Icon className="h-6 w-6 text-primary" />
					</div>
				)}
			</div>
		</div>
	);
}
