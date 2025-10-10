import { Button } from "@codaco/ui";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
	icon: LucideIcon;
	title: string;
	description: string;
	action?: {
		label: string;
		onClick: () => void;
	};
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
	return (
		<div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed bg-white p-12 text-center">
			<div className="rounded-full bg-gray-100 p-4">
				<Icon className="h-12 w-12 text-gray-400" />
			</div>
			<h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
			<p className="mt-2 max-w-md text-sm text-gray-500">{description}</p>
			{action && (
				<Button onClick={action.onClick} className="mt-6">
					{action.label}
				</Button>
			)}
		</div>
	);
}
