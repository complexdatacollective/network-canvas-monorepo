import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "~/utils/cn";
import IssueAnchor from "../IssueAnchor";
import Switch from "../NewComponents/Switch";

const containerClasses = "p-6 shadow-md rounded bg-[var(--current-surface)] text-[(--current-surface-foreground)]";

type SectionProps = {
	id?: string | null;
	title: string;
	summary?: React.ReactNode;
	disabled?: boolean;
	group?: boolean;
	children: React.ReactNode;
	className?: string;
	toggleable?: boolean;
	startExpanded?: boolean;
	handleToggleChange?: (state: boolean) => Promise<boolean> | boolean;
	layout?: "horizontal" | "vertical";
};

const Section = ({
	id = null,
	title,
	summary = null,
	disabled = false,
	group = false,
	children,
	className = "",
	toggleable = false,
	startExpanded = true,
	handleToggleChange = (state) => state,
	layout = "horizontal",
}: SectionProps) => {
	const [isOpen, setIsOpen] = useState(startExpanded);

	// If the startExpanded prop changes, update the state.
	// This happens when a stage is reset
	useEffect(() => {
		setIsOpen(startExpanded);
	}, [startExpanded]);

	const changeToggleState = useCallback(async () => {
		// Save the intended state here, so that if startExpanded changes
		// in the meantime, we don't inadvertently change the open state
		// back.
		const intendedState = !isOpen;
		const result = await handleToggleChange(!isOpen);

		// If result of the callback, update the state with intendedState
		if (result) {
			setIsOpen(intendedState);
		}
	}, [isOpen, handleToggleChange]);

	const classes = cn(layout === "horizontal" && containerClasses, "relative");

	return (
		<div
			className={cn(
				"[--input-background:var(--color-surface-1)] [--slider-color:hsl(var(--charcoal))]",
				"[--current-surface:var(--color-surface-1)] [--current-surface-foreground:var(--color-surface-1-foreground)] relative",
				"w-full max-w-7xl",
				layout === "horizontal" && "grid grid-cols-[20rem_auto] gap-8",
				layout === "vertical" && "flex flex-col mb-4",
				layout === "vertical" && containerClasses,
				className,
			)}
		>
			<div>
				<legend
					className={cn(
						"flex gap-4 items-center text-right",
						layout === "vertical" && "text-xl font-semibold tracking-tight",
						layout === "horizontal" &&
							"small-heading px-6 py-2 rounded items-center justify-between flex-row-reverse bg-border sticky top-2  [--color-input:var(--color-navy-taupe)] [--color-input-foreground:white]",
					)}
				>
					<span>
						{title}
						{!toggleable && <span className="text-error ms-1">*</span>}
					</span>
					{toggleable && (
						<Switch
							title="Turn this feature on or off"
							checked={isOpen}
							onCheckedChange={changeToggleState}
							className="shrink-0 grow-0"
						/>
					)}
				</legend>
				<div className="text-current/70">{summary}</div>
			</div>
			<fieldset className={classes}>
				{isOpen && children}
				{toggleable && !isOpen && layout !== "vertical" && (
					<div className="absolute inset-0 flex justify-center items-center w-full h-full bg-border/75 text-foreground/70 font-semibold italic">
						Click the toggle to enable this feature...
					</div>
				)}
				{id && <IssueAnchor fieldName={id} description={title} />}
			</fieldset>
		</div>
	);
};

export default Section;
