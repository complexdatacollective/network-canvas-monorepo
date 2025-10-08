import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Label } from "./Label";
import { cn } from "./utils";

export const inputClasses = cn(
	"text-input-foreground flex h-10 w-full rounded-input border border-border bg-input ring-offset-background",
	"disabled:cursor-not-allowed disabled:opacity-50",
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
	"placeholder:text-muted-foreground",
	"file:border-0 file:bg-transparent file:text-sm file:font-medium",
);

export const inputVariants = cva(inputClasses, {
	variants: {
		size: {
			default: "h-10 px-3 py-2 text-sm [&.adornment-left]:mr-2",
			lg: "h-12 px-4 py-3 text-base [&.adornment-left]:mr-4",
			xl: "h-14 px-5 py-4 text-lg [&.adornment-left]:mr-5",
			"2xl": "h-16 px-6 py-5 text-xl [&.adornment-left]:mr-6",
			"3xl": "h-20 px-8 py-6 text-2xl [&.adornment-left]:mr-8",
		},
	},
	defaultVariants: {
		size: "default",
	},
});

type InputProps = {
	size?: VariantProps<typeof inputVariants>["size"];
	inputClassName?: string;
	label?: string;
	hint?: React.ReactNode;
	id?: string;
	error?: string;
	leftAdornment?: React.ReactNode;
	rightAdornment?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, size, inputClassName, type, label, hint, rightAdornment, leftAdornment, error, ...props }, ref) => {
		const id = props.id ?? props.name;
		return (
			<div className={cn("relative mt-4 grid items-center gap-2", className)}>
				{label && (
					<Label htmlFor={id} required={props.required}>
						{label}
					</Label>
				)}
				{hint && <span className="text-sm leading-5 text-muted-foreground">{hint}</span>}
				<div className="relative flex items-center justify-end">
					{leftAdornment && <div className="adornment-left absolute">{leftAdornment}</div>}
					<input
						id={id}
						type={type}
						className={cn(
							inputVariants({ size }),
							Boolean(leftAdornment) && "pl-10",
							Boolean(rightAdornment) && "pr-10",
							inputClassName,
						)}
						ref={ref}
						{...props}
					/>
					{rightAdornment && <div className="adornment-right absolute">{rightAdornment}</div>}
				</div>
				{error && (
					<span role="alert" className="text-sm text-destructive">
						{error}
					</span>
				)}
			</div>
		);
	},
);
Input.displayName = "Input";

export { Input };
