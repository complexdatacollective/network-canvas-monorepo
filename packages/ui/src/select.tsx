"use client";

import {
	Content,
	Group,
	Icon,
	Item,
	ItemIndicator,
	ItemText,
	Label,
	Portal,
	Root,
	Separator,
	Trigger,
	Value,
	Viewport,
} from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";

import { cn } from "./utils";

const Select = Root;

const SelectGroup = Group;

const SelectValue = forwardRef<ElementRef<typeof Value>, ComponentPropsWithoutRef<typeof Value>>(
	({ className, ...props }, ref) => (
		<span className={cn("overflow-hidden text-ellipsis whitespace-nowrap", className)}>
			<Value ref={ref} {...props} />
		</span>
	),
);

SelectValue.displayName = Value.displayName;

export const selectTriggerStyles = cn(
	"text-input-foreground flex h-10 w-full items-center justify-between rounded-input border border-border bg-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
	"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
);

const SelectTrigger = forwardRef<ElementRef<typeof Trigger>, ComponentPropsWithoutRef<typeof Trigger>>(
	({ className, children, ...props }, ref) => (
		<Trigger ref={ref} className={cn(selectTriggerStyles, className)} {...props}>
			{children}
			<Icon asChild>
				<ChevronDown className="h-4 w-4 opacity-50" />
			</Icon>
		</Trigger>
	),
);
SelectTrigger.displayName = Trigger.displayName;

const SelectContent = forwardRef<ElementRef<typeof Content>, ComponentPropsWithoutRef<typeof Content>>(
	({ className, children, position = "popper", ...props }, _) => (
		<Portal>
			<Content
				// This is a workaround for this issue: https://github.com/radix-ui/primitives/issues/1658
				ref={(ref) => ref?.addEventListener("touchend", (e) => e.preventDefault())}
				className={cn(
					"relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
					position === "popper" &&
						"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
					className,
				)}
				position={position}
				{...props}
			>
				<Viewport
					className={cn(
						"p-1",
						position === "popper" &&
							"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
					)}
				>
					{children}
				</Viewport>
			</Content>
		</Portal>
	),
);
SelectContent.displayName = Content.displayName;

const SelectLabel = forwardRef<ElementRef<typeof Label>, ComponentPropsWithoutRef<typeof Label>>(
	({ className, ...props }, ref) => (
		<Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
	),
);
SelectLabel.displayName = Label.displayName;

const SelectItem = forwardRef<ElementRef<typeof Item>, ComponentPropsWithoutRef<typeof Item>>(
	({ className, children, ...props }, ref) => (
		<Item
			ref={ref}
			className={cn(
				"relative flex w-full cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<ItemIndicator>
					<Check className="h-4 w-4" />
				</ItemIndicator>
			</span>

			<ItemText>{children}</ItemText>
		</Item>
	),
);
SelectItem.displayName = Item.displayName;

const SelectSeparator = forwardRef<ElementRef<typeof Separator>, ComponentPropsWithoutRef<typeof Separator>>(
	({ className, ...props }, ref) => (
		<Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
	),
);
SelectSeparator.displayName = Separator.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator };
