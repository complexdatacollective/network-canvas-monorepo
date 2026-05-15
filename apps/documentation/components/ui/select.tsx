"use client";

import {
	Content,
	Group,
	Icon,
	Item,
	ItemIndicator,
	ItemText,
	Portal,
	Root,
	Trigger,
	Viewport,
} from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from "react";

import { cn } from "~/lib/utils";

const Select = Root;

const SelectGroup = Group;

const selectTriggerStyles = cn(
	"text-input-foreground flex h-10 w-full items-center justify-between rounded-input border border-border bg-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
	"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
);

const SelectTrigger = forwardRef<ComponentRef<typeof Trigger>, ComponentPropsWithoutRef<typeof Trigger>>(
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

const SelectContent = forwardRef<ComponentRef<typeof Content>, ComponentPropsWithoutRef<typeof Content>>(
	({ className, children, position = "popper", ...props }, _) => (
		<Portal>
			<Content
				// Workaround for https://github.com/radix-ui/primitives/issues/1658
				ref={(ref) => ref?.addEventListener("touchend", (e) => e.preventDefault())}
				className={cn(
					"relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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
							"h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)",
					)}
				>
					{children}
				</Viewport>
			</Content>
		</Portal>
	),
);
SelectContent.displayName = Content.displayName;

const SelectItem = forwardRef<ComponentRef<typeof Item>, ComponentPropsWithoutRef<typeof Item>>(
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

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger };
