import cx from "classnames";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Toggle } from "~/lib/legacy-ui/components/Fields";
import IssueAnchor from "../IssueAnchor";

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
		"stage-editor-section",
		group ? "bg-section-background-dark" : "bg-section-background",
		{ "stage-editor-section--toggleable": toggleable },
		{ "stage-editor-section--open": isOpen },
		{ "stage-editor-section--disabled": disabled },
		{ "stage-editor-section--group": group },
		className,
	);

	return (
		<fieldset className={sectionClasses}>
			<legend
				className={cx(toggleable ? "toggleable" : "", group ? "bg-section-background-dark" : "bg-section-background")}
			>
				{toggleable && (
					<Toggle
						input={{
							value: isOpen,
							onChange: changeToggleState,
						}}
						title="Turn this feature on or off"
					/>
				)}
				{title}
				{!toggleable && <span className="text-error"> *</span>}
			</legend>
			<div className="summary">{summary}</div>
			{id && <IssueAnchor fieldName={id} description={title} />}
			<AnimatePresence initial={false}>
				{(isOpen || !toggleable) && (
					<motion.div
						variants={animations}
						initial="collapsed"
						animate="open"
						exit="collapsed"
						transition={{ duration: 0.2, type: "easeInOut" }}
					>
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</fieldset>
	);
};

export default Section;
