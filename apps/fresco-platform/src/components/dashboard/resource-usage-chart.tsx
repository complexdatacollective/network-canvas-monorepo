"use client";

import { cn } from "@codaco/ui";

type ResourceUsageChartProps = {
	title: string;
	current: number;
	max: number;
	unit: string;
	color?: "blue" | "green" | "yellow" | "red";
};

const colorClasses = {
	blue: {
		bg: "bg-blue-500",
		text: "text-blue-700",
	},
	green: {
		bg: "bg-green-500",
		text: "text-green-700",
	},
	yellow: {
		bg: "bg-yellow-500",
		text: "text-yellow-700",
	},
	red: {
		bg: "bg-red-500",
		text: "text-red-700",
	},
};

export function ResourceUsageChart({ title, current, max, unit, color = "blue" }: ResourceUsageChartProps) {
	const percentage = max > 0 ? (current / max) * 100 : 0;
	const clampedPercentage = Math.min(100, Math.max(0, percentage));

	const displayColor = clampedPercentage > 80 ? "red" : clampedPercentage > 60 ? "yellow" : color;

	return (
		<div className="rounded-lg border bg-white p-6">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="font-medium text-gray-900">{title}</h3>
				<span className={cn("text-sm font-semibold", colorClasses[displayColor].text)}>{percentage.toFixed(1)}%</span>
			</div>

			<div className="mb-2 h-4 w-full overflow-hidden rounded-full bg-gray-200">
				<div
					className={cn("h-full transition-all duration-500", colorClasses[displayColor].bg)}
					style={{ width: `${clampedPercentage}%` }}
				/>
			</div>

			<div className="flex justify-between text-sm text-gray-600">
				<span>
					{current.toFixed(2)} {unit}
				</span>
				<span>
					{max.toFixed(2)} {unit}
				</span>
			</div>
		</div>
	);
}
