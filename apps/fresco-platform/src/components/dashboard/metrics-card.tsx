import { cn } from "@codaco/ui";

type MetricsCardProps = {
	title: string;
	value: string | number;
	unit?: string;
	description?: string;
	trend?: "up" | "down" | "stable";
	color?: "blue" | "green" | "yellow" | "red" | "purple";
};

const colorClasses = {
	blue: "bg-blue-50 text-blue-700 border-blue-200",
	green: "bg-green-50 text-green-700 border-green-200",
	yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
	red: "bg-red-50 text-red-700 border-red-200",
	purple: "bg-purple-50 text-purple-700 border-purple-200",
};

export function MetricsCard({ title, value, unit, description, trend, color = "blue" }: MetricsCardProps) {
	return (
		<div className={cn("rounded-lg border p-4", colorClasses[color])}>
			<div className="flex items-start justify-between">
				<div className="flex-1">
					<p className="text-sm font-medium opacity-80">{title}</p>
					<div className="mt-2 flex items-baseline gap-1">
						<span className="text-2xl font-bold">{value}</span>
						{unit && <span className="text-sm opacity-70">{unit}</span>}
					</div>
					{description && <p className="mt-1 text-xs opacity-70">{description}</p>}
				</div>
				{trend && (
					<div className="ml-2">
						{trend === "up" && <span className="text-sm">↑</span>}
						{trend === "down" && <span className="text-sm">↓</span>}
						{trend === "stable" && <span className="text-sm">→</span>}
					</div>
				)}
			</div>
		</div>
	);
}
