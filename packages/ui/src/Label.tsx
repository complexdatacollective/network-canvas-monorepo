"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { headingVariants } from "./typography/Heading";
import { cn } from "./utils";

const Label = React.forwardRef<
	React.ElementRef<typeof LabelPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
		required?: boolean;
	} & VariantProps<typeof headingVariants>
>(({ className, required, ...props }, ref) => (
	<LabelPrimitive.Root ref={ref} className={cn(headingVariants({ variant: "label" }), className)} {...props}>
		{props.children}
		{required && (
			<span className="text-destructive" aria-hidden="true">
				{" "}
				*
			</span>
		)}
	</LabelPrimitive.Root>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
