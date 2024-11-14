import { BackgroundBlobs } from "@codaco/art";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const fancyButtonVariants = cva(
	"relative inline-flex items-center justify-center overflow-hidden rounded-xl text-lg font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default:
					"border border-primary-foreground bg-primary text-primary-foreground hover:border-primary-foreground/90 hover:bg-primary/90",
			},
			size: {
				default: "px-8 py-4",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export type FancyButtonProps = {
	asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof fancyButtonVariants>;

const FancyButton = React.forwardRef<HTMLButtonElement, FancyButtonProps>(
	({ children, className, variant, size, ...props }, ref) => {
		return (
			<button ref={ref} {...props} className={cn(fancyButtonVariants({ variant, size, className }))}>
				<span className="relative z-10 drop-shadow-[0_1.2px_rgba(0,0,0,0.8)]">{children}</span>
				<div className={cn(`absolute inset-0 h-full w-full opacity-50`)}>
					<BackgroundBlobs large={5} medium={3} small={0} />
				</div>
			</button>
		);
	},
);

FancyButton.displayName = "Button";

export { FancyButton, fancyButtonVariants };
