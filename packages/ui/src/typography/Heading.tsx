"use client";

import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import React from "react";

import { cn } from "../utils";

export const headingVariants = cva("text-balance", {
	variants: {
		variant: {
			h1: "mb-6 scroll-m-20 text-3xl font-extrabold tracking-tight [&:not(:first-child)]:mt-8",
			h2: "mb-4 scroll-m-20 text-xl font-semibold tracking-tight [&:not(:first-child)]:mt-6",
			h3: "mb-2 scroll-m-20 text-lg font-semibold tracking-tight [&:not(:first-child)]:mt-5",
			h4: "mb-1 scroll-m-20 text-base font-semibold tracking-tight [&:not(:first-child)]:mt-4",
			"h4-all-caps": "mb-1 scroll-m-20 text-sm font-extrabold uppercase tracking-[.2em] [&:not(:first-child)]:mt-6",
			label:
				"scroll-m-20 text-sm font-extrabold tracking-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
		},
		margin: {
			default: "",
			none: "!m-0",
		},
	},
	defaultVariants: {
		variant: "h1",
		margin: "default",
	},
});

type VariantPropType = VariantProps<typeof headingVariants>;

const variantElementMap: Record<NonNullable<VariantPropType["variant"]>, string> = {
	h1: "h1",
	h2: "h2",
	h3: "h3",
	h4: "h4",
	"h4-all-caps": "h4",
	label: "label",
};

export type HeadingProps = {
	asChild?: boolean;
	as?: string;
} & React.HTMLAttributes<HTMLHeadingElement> &
	VariantProps<typeof headingVariants>;

const Heading = React.forwardRef<HTMLElement, HeadingProps>(
	({ className, variant, margin, as, asChild, ...props }, ref) => {
		const Comp = asChild ? Slot : (as ?? (variant ? variantElementMap[variant] : undefined) ?? "div");
		return <Comp className={cn(headingVariants({ variant, margin, className }))} ref={ref} {...props} />;
	},
);

Heading.displayName = "Heading";

export default Heading;
