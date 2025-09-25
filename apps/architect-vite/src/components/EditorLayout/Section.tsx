import cx from "classnames";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "~/utils/cn";
import IssueAnchor from "../IssueAnchor";
import Switch from "../NewComponents/Switch";

const _animations = {
	collapsed: {
		overflow: "hidden",
		height: 0,
		opacity: 0,
	},
	open: {
		overflow: "visible",
		height: "auto",
		opacity: 1,
	},
};

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
	handleToggleChange?: (state: boolean) => Promise<boolean>;
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
	handleToggleChange = (state) => Promise.resolve(state),
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

	const _sectionClasses = cx(
		"stage-editor-section border border-platinum-dark w-full relative",
		{ "stage-editor-section--toggleable": toggleable },
		{ "stage-editor-section--open": isOpen },
		{ "stage-editor-section--disabled": disabled },
		{ "stage-editor-section--group": group },
		className,
	);

	const classes = cn(
		"[--input-background:var(--color-surface-1)] [--slider-color:hsl(var(--charcoal))]",
		"[--current-surface:var(--color-surface-1)] [--current-surface-foreground:var(--color-surface-1-foreground)] relative px-6 py-4 shadow-md rounded bg-[var(--current-surface)] text-[(--current-surface-foreground)]",
		toggleable && "cursor-pointer",
	);

	return (
		<div className="w-full grid gap-4 grid-cols-[25%_auto] max-w-6xl">
			<div>
				<legend className="flex px-6 py-2 rounded items-center justify-between flex-row-reverse bg-border sticky top-2 gap-4 [--color-input:var(--color-navy-taupe)] [--color-input-foreground:white]">
					<span className="small-heading">
						{title}
						{!toggleable && <span className="text-error">*</span>}
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
				<div className="summary">{summary}</div>
			</div>
			<fieldset className={classes}>
				{children}
				{toggleable && !isOpen && (
					<div className="absolute inset-0 flex justify-center items-center w-full h-full bg-border/75 backdrop-blur-sm text-foreground/70 font-semibold italic">
						Cick the toggle to enable this feature...
					</div>
				)}
				{id && <IssueAnchor fieldName={id} description={title} />}
			</fieldset>
		</div>
	);
};

export default Section;
