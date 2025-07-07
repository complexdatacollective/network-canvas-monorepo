import cx from "classnames";
import { motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import IssueAnchor from "../IssueAnchor";
import Switch from "../NewComponents/Switch";

const animations = {
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

	const sectionClasses = cx(
		"stage-editor-section border border-platinum-dark w-full",
		{ "stage-editor-section--toggleable": toggleable },
		{ "stage-editor-section--open": isOpen },
		{ "stage-editor-section--disabled": disabled },
		{ "stage-editor-section--group": group },
		className,
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
			<fieldset className={sectionClasses}>
				{id && <IssueAnchor fieldName={id} description={title} />}
				<motion.div
					variants={animations}
					initial="collapsed"
					animate="open"
					exit="collapsed"
					transition={{ duration: 0.2, ease: "easeInOut" }}
				>
					{children}
				</motion.div>
			</fieldset>
		</div>
	);
};

export default Section;
