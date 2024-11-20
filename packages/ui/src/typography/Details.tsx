"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, forwardRef } from "react";
import { cn } from "../utils";
import { paragraphVariants } from "./Paragraph";

export const Details = forwardRef<
	HTMLDetailsElement,
	{
		children: ReactNode;
		className?: string;
	}
>(({ className, children, ...props }, ref) => {
	return (
		<details
			ref={ref}
			className={cn(
				paragraphVariants({ margin: "forced" }),
				"my-5 rounded-xl border-2 border-border px-5 [&_svg]:open:rotate-90", // Rotate the summary arrow
				className,
			)}
			{...props}
		>
			{children}
		</details>
	);
});

Details.displayName = "Details";

// It seems like HTMLSummaryElement was removed from lib dom at some point,
// but I can't find any information about it.
type HTMLSummaryElement = HTMLElement & {
	open: boolean;
};

export const Summary = forwardRef<
	HTMLSummaryElement,
	{
		children: ReactNode;
		className?: string;
	}
>(({ className, children, ...props }, ref) => {
	return (
		<summary
			ref={ref}
			className={cn(
				"flex cursor-pointer select-none list-none items-center gap-2",

				className,
			)}
			{...props}
		>
			<ChevronRight size={24} className="inline-block h-6 w-6 text-accent transition-all" />
			<div className="my-5">{children}</div>
		</summary>
	);
});

Summary.displayName = "Summary";
