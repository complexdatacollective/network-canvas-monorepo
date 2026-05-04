import { isEmpty, map } from "es-toolkit/compat";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { getFormSyncErrors, hasSubmitFailed } from "redux-form";
import { Icon } from "~/lib/legacy-ui/components";
import { flattenIssues, getFieldId } from "../utils/issues";
import scrollTo from "../utils/scrollTo";
import { formName } from "./StageEditor/configuration";

const variants = {
	show: {
		opacity: 1,
		y: 0,
	},
	hide: {
		opacity: 0,
		y: "100%",
	},
};

const Issues = () => {
	const formErrors = useSelector(getFormSyncErrors(formName));
	const submitFailed = useSelector(hasSubmitFailed(formName));
	const issues = formErrors as Record<string, unknown>;
	const [show, setShow] = useState(false);
	const [open, setOpen] = useState(true);
	const flatIssues = flattenIssues(issues);
	const issueRefs = useRef<Record<string, HTMLElement | null>>({});

	const hasOutstandingIssues = Object.keys(issues).length !== 0;

	useEffect(() => {
		if (submitFailed) {
			setShow(true);
		}
	}, [submitFailed]);

	useEffect(() => {
		if (!hasOutstandingIssues) {
			setShow(false);
		}
	}, [hasOutstandingIssues]);

	const setIssueRef = (el: HTMLElement | null, fieldId: string) => {
		issueRefs.current[fieldId] = el;
	};

	/**
	 * Because display information for fields is essentially stored in the dom
	 * we use that as our data source for the field labels in the issue list.
	 */
	const updateFieldNames = () => {
		// for each issue get friendly title from dom
		flatIssues.forEach(({ field }: { field: string; issue: string }) => {
			const fieldId = getFieldId(field);

			const targetField = document.querySelector(`#${fieldId}`);

			if (!targetField) {
				return;
			}

			const fieldName = targetField.getAttribute("data-name") || targetField.textContent;

			if (fieldName && issueRefs?.current[fieldId]) {
				issueRefs.current[fieldId].textContent = fieldName;
			}
		});
	};

	useEffect(() => {
		updateFieldNames();
	});

	// when panel hidden by parent reset collapsed state
	const noIssues = isEmpty(issues);
	useEffect(() => {
		if (noIssues || !show) {
			setOpen(true);
		}
	}, [show, noIssues]);

	const handleClickTitleBar = () => setOpen((toggle) => !toggle);

	const handleClickIssue = (e: React.MouseEvent) => {
		e.preventDefault();

		const target = e.target as HTMLElement;
		const link = target.closest("a")?.getAttribute("href");
		if (link) {
			const destination = document.querySelector(link);
			if (destination instanceof HTMLElement) {
				scrollTo(destination);
			}
		}
	};

	const renderIssues = () =>
		map(flatIssues, ({ field, issue }) => {
			const fieldId = getFieldId(field);

			return (
				<li key={fieldId} className="issues__issue">
					<a href={`#${fieldId}`} onClick={handleClickIssue}>
						<span ref={(el) => setIssueRef(el, fieldId)}>{field}</span> - {issue}
					</a>
				</li>
			);
		});

	const isVisible = show && flatIssues.length > 0;

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					className="issues"
					variants={variants}
					initial="hide"
					animate="show"
					exit="hide"
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 30,
					}}
				>
					<div className="issues__panel">
						<button
							type="button"
							className="issues__title-bar"
							onClick={handleClickTitleBar}
							aria-label={`${open ? "Collapse" : "Expand"} issues panel`}
							aria-expanded={open}
						>
							<div className="issues__title-bar-icon">
								<Icon name="info" />
							</div>
							<div className="issues__title-bar-text">Issues ({flatIssues.length})</div>
							<motion.div className="issues__title-bar-toggle" animate={{ rotate: isVisible ? 180 : 0 }}>
								<Icon name="chevron-up" color="white" className="issues-toggle" />
							</motion.div>
						</button>
						<motion.ol className="issues__issues" initial={{ height: 0 }} animate={{ height: open ? "auto" : 0 }}>
							{renderIssues()}
						</motion.ol>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};

export default Issues;
