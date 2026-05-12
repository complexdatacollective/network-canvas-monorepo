import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "~/utils/cn";
import IssueAnchor from "../IssueAnchor";
import Switch from "../NewComponents/Switch";

const containerClasses =
	"p-6 shadow-md rounded bg-[var(--current-surface)] text-[var(--current-surface-foreground)] relative";

type SectionProps = {
	id?: string | null;
	title: string;
	summary?: React.ReactNode;
	disabled?: boolean;
	disabledMessage?: string;
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
	disabledMessage = "Complete the required options above to enable this section.",
	group: _group = false,
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

	// In the "horizontal" layout, below the lg: breakpoint we render the section
	// as the "vertical" layout
	const classes = cn(
		layout === "horizontal" &&
			"lg:p-6 lg:shadow-md lg:rounded lg:bg-[var(--current-surface)] lg:text-[var(--current-surface-foreground)] lg:min-w-2xl",
		"relative",
	);

	return (
		<div
			className={cn(
				"[--input-background:var(--color-surface-1)] [--slider-color:hsl(var(--charcoal))]",
				"[--current-surface:var(--color-surface-1)] [--current-surface-foreground:var(--color-surface-1-foreground)] relative",
				"w-full max-w-7xl",
				layout === "horizontal" &&
					"lg:grid lg:grid-cols-[20rem_auto] lg:gap-8 max-lg:flex max-lg:flex-col max-lg:gap-(--space-md) max-lg:mb-4 max-lg:p-6 max-lg:shadow-md max-lg:rounded max-lg:bg-[var(--current-surface)] max-lg:text-[var(--current-surface-foreground)]",
				layout === "vertical" && "flex flex-col gap-(--space-md) mb-4",
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
							"lg:small-heading lg:px-6 lg:py-2 lg:rounded lg:items-center lg:justify-between lg:flex-row-reverse lg:bg-border lg:sticky lg:top-2 max-lg:text-xl max-lg:font-semibold max-lg:tracking-tight",
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
							disabled={disabled}
							className={cn("shrink-0 grow-0", disabled && "opacity-50 cursor-not-allowed")}
						/>
					)}
				</legend>
				<div className="text-current/70">{summary}</div>
			</div>
			<fieldset className={classes}>
				{disabled ? (
					layout === "horizontal" ? (
						<div className="flex justify-center items-center bg-border/75 text-foreground/70 font-semibold italic rounded lg:absolute lg:inset-0 lg:w-full lg:h-full max-lg:p-8 max-lg:text-center">
							{disabledMessage}
						</div>
					) : (
						<div className="flex items-center justify-center p-8 bg-border/75 text-foreground/70 font-semibold italic text-center rounded">
							{disabledMessage}
						</div>
					)
				) : (
					<>
						{isOpen && children}
						{toggleable && !isOpen && layout !== "vertical" && (
							<div className="absolute inset-0 flex justify-center items-center w-full h-full bg-border/75 text-foreground/70 font-semibold italic max-lg:hidden">
								Click the toggle to enable this feature...
							</div>
						)}
					</>
				)}
				{id && <IssueAnchor fieldName={id} description={title} />}
			</fieldset>
		</div>
	);
};

export default Section;
