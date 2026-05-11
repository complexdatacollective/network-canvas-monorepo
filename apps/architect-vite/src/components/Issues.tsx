import { map } from "es-toolkit/compat";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { getFormSyncErrors, hasSubmitFailed } from "redux-form";
import { flattenIssues, getFieldId } from "../utils/issues";
import scrollTo from "../utils/scrollTo";
import { formName } from "./StageEditor/configuration";

export type IssuesHandle = {
	open: () => void;
	hasIssues: boolean;
};

const Issues = forwardRef<IssuesHandle>((_, ref) => {
	const formErrors = useSelector(getFormSyncErrors(formName));
	const submitFailed = useSelector(hasSubmitFailed(formName));
	const issues = formErrors as Record<string, unknown>;
	const flatIssues = flattenIssues(issues);
	const hasIssues = flatIssues.length > 0;
	const issueCount = flatIssues.length;

	const [expanded, setExpanded] = useState(false);
	const issueRefs = useRef<Record<string, HTMLElement | null>>({});

	useImperativeHandle(
		ref,
		() => ({
			open: () => {
				if (hasIssues) setExpanded(true);
			},
			hasIssues,
		}),
		[hasIssues],
	);

	useEffect(() => {
		if (submitFailed && hasIssues) {
			setExpanded(true);
		}
	}, [submitFailed, hasIssues]);

	useEffect(() => {
		if (!hasIssues) setExpanded(false);
	}, [hasIssues]);

	const setIssueRef = (el: HTMLElement | null, fieldId: string) => {
		issueRefs.current[fieldId] = el;
	};

	// Field display labels live in the DOM; harvest friendly names from each field's
	// data-name/textContent so the list reads as a label rather than an internal path.
	useEffect(() => {
		flatIssues.forEach(({ field }: { field: string; issue: string }) => {
			const fieldId = getFieldId(field);
			const targetField = document.querySelector(`#${fieldId}`);
			if (!targetField) return;
			const fieldName = targetField.getAttribute("data-name") || targetField.textContent;
			if (fieldName && issueRefs?.current[fieldId]) {
				issueRefs.current[fieldId].textContent = fieldName;
			}
		});
	});

	if (!hasIssues || !submitFailed) return null;

	const handleClickIssue = (e: React.MouseEvent) => {
		e.preventDefault();
		const target = e.target as HTMLElement;
		const link = target.closest("a")?.getAttribute("href");
		if (link) {
			const destination = document.querySelector(link);
			if (destination instanceof HTMLElement) {
				scrollTo(destination);
				setExpanded(false);
			}
		}
	};

	return (
		<div className="border-b border-(--color-sea-serpent-dark)/40">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				aria-expanded={expanded}
				className="flex w-full items-center gap-(--space-md) bg-(--color-sea-serpent) px-(--space-md) py-3 text-(--color-primary-foreground) text-left cursor-pointer border-none"
			>
				<TriangleAlert className="size-4 shrink-0" aria-hidden />
				<span className="flex-1 text-sm font-(--font-weight-semibold) uppercase tracking-[0.05em]">
					Issues ({issueCount})
				</span>
				<motion.span animate={{ rotate: expanded ? 180 : 0 }} aria-hidden>
					<ChevronDown className="size-4" />
				</motion.span>
			</button>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0 }}
						animate={{ height: "auto" }}
						exit={{ height: 0 }}
						transition={{ type: "tween", duration: 0.18 }}
						className="overflow-hidden bg-(--color-sea-serpent) text-(--color-primary-foreground)"
					>
						<ol className="m-0 max-h-80 list-none overflow-y-auto p-0 [counter-reset:issue]">
							{map(flatIssues, ({ field, issue }) => {
								const fieldId = getFieldId(field);
								return (
									// `issues__issue` marker is preserved for the Issues.test.tsx selector.
									<li
										key={fieldId}
										className="issues__issue m-0 bg-transparent p-0 transition-colors duration-(--animation-duration-standard) ease-(--animation-easing) hover:bg-(--color-sea-green)"
									>
										<a
											href={`#${fieldId}`}
											onClick={handleClickIssue}
											className="block w-full px-(--space-md) py-(--space-sm) text-(--color-primary-foreground) no-underline before:mr-(--space-sm) before:[content:counter(issue)_'.'] before:[counter-increment:issue]"
										>
											<span ref={(el) => setIssueRef(el, fieldId)}>{field}</span> - {issue}
										</a>
									</li>
								);
							})}
						</ol>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
});

Issues.displayName = "Issues";

export default Issues;
