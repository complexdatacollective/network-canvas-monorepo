"use client";

import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { headingVariants } from "./typography/Heading";
import { cx } from "./utils/cva";
import { motionSafeProps } from "./utils/motionSafeProps";

type AccordionProps<Value> = Omit<BaseAccordion.Root.Props<Value>, "className"> & {
	className?: string;
};

function Accordion<Value = unknown>({ className, ...props }: AccordionProps<Value>) {
	return <BaseAccordion.Root<Value> className={cx("flex flex-col gap-4", className)} {...props} />;
}

type AccordionItemProps = Omit<ComponentProps<typeof BaseAccordion.Item>, "className"> & {
	className?: string;
};

function AccordionItem({ className, ...props }: AccordionItemProps) {
	return <BaseAccordion.Item className={className} {...props} />;
}

type AccordionHeaderProps = Omit<ComponentProps<typeof BaseAccordion.Header>, "className"> & {
	className?: string;
};

function AccordionHeader({ ...props }: AccordionHeaderProps) {
	return <BaseAccordion.Header {...props} />;
}

type AccordionTriggerProps = Omit<ComponentProps<typeof BaseAccordion.Trigger>, "className"> & {
	className?: string;
};

function AccordionTrigger({ className, children, ...props }: AccordionTriggerProps) {
	return (
		<BaseAccordion.Trigger
			className={cx(
				headingVariants({ level: "h4", variant: "all-caps", margin: "none" }),
				"focusable flex w-full flex-1 cursor-pointer items-center justify-between gap-4",
				className,
			)}
			{...props}
		>
			{children}
			<ChevronDown className="transition-transform [[data-panel-open]>&]:rotate-180" />
		</BaseAccordion.Trigger>
	);
}

type AccordionPanelProps = Omit<ComponentProps<typeof BaseAccordion.Panel>, "className" | "render"> & {
	className?: string;
};

function AccordionPanel({ className, children, keepMounted = true, ...props }: AccordionPanelProps) {
	return (
		<BaseAccordion.Panel
			keepMounted={keepMounted}
			{...props}
			render={(renderProps, state) => (
				<motion.div
					{...motionSafeProps(renderProps)}
					aria-hidden={!state.open}
					animate={{
						height: state.open ? "auto" : 0,
						opacity: state.open ? 1 : 0,
					}}
					initial={false}
					transition={{ duration: 0.2, ease: "easeInOut" }}
					style={{ ...renderProps.style, overflow: "hidden" }}
					className={cx("mt-2", className)}
				>
					{children}
				</motion.div>
			)}
		/>
	);
}

export { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger };
