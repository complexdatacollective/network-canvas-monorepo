import { cn } from "@codaco/ui";
import { Loader2 } from "lucide-react";

type LoadingSpinnerProps = {
	size?: "sm" | "md" | "lg";
	text?: string;
	fullScreen?: boolean;
};

export function LoadingSpinner({ size = "md", text, fullScreen = false }: LoadingSpinnerProps) {
	const sizeClasses = {
		sm: "h-4 w-4",
		md: "h-8 w-8",
		lg: "h-12 w-12",
	};

	const spinner = (
		<div className="flex flex-col items-center justify-center gap-3">
			<Loader2 className={cn("animate-spin text-primary", sizeClasses[size])} />
			{text && <p className="text-sm text-gray-600">{text}</p>}
		</div>
	);

	if (fullScreen) {
		return <div className="flex min-h-[400px] items-center justify-center">{spinner}</div>;
	}

	return spinner;
}
