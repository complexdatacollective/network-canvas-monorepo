import { cn } from "./utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("animate-pulse bg-background", className)} {...props} />;
}

export { Skeleton };
