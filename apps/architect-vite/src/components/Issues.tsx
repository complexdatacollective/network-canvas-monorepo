import { Popover } from "@base-ui/react/popover";
import { map } from "es-toolkit/compat";
import { TriangleAlert } from "lucide-react";
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

	const [open, setOpen] = useState(false);
	const issueRefs = useRef<Record<string, HTMLElement | null>>({});

	useImperativeHandle(
		ref,
		() => ({
			open: () => {
				if (hasIssues) setOpen(true);
			},
			hasIssues,
		}),
		[hasIssues],
	);

	useEffect(() => {
		if (submitFailed && hasIssues) {
			setOpen(true);
		}
	}, [submitFailed, hasIssues]);

	useEffect(() => {
		if (!hasIssues) setOpen(false);
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
				setOpen(false);
			}
		}
	};

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				render={
					<button
						type="button"
						className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-sea-serpent-dark bg-sea-serpent px-6 py-2 text-sm font-[500] tracking-wide text-white transition-colors duration-200 hover:bg-sea-serpent-dark"
					>
						<TriangleAlert className="size-4" />
						Issues ({issueCount})
					</button>
				}
			/>
			<Popover.Portal>
				<Popover.Positioner side="top" align="start" sideOffset={8} className="z-(--z-tooltip)">
					<Popover.Popup className="flex max-h-[80vh] min-w-md max-w-lg flex-col overflow-hidden rounded-sm bg-(--color-sea-serpent) text-(--color-primary-foreground) shadow-lg">
						<div className="flex items-center gap-(--space-md) border-b border-(--color-sea-serpent-dark)/40 px-(--space-md) py-3">
							<TriangleAlert className="size-4 shrink-0" aria-hidden />
							<span className="text-sm font-(--font-weight-semibold) uppercase tracking-[0.05em]">
								Issues ({issueCount})
							</span>
						</div>
						<ol className="m-0 list-none overflow-y-auto p-0 [counter-reset:issue]">
							{map(flatIssues, ({ field, issue }) => {
								const fieldId = getFieldId(field);
								return (
									// `issues__issue` marker is preserved for the Issues.test.tsx selector.
									<li
										key={fieldId}
										className="issues__issue m-0 bg-transparent p-0 transition-colors duration-(--animation-duration-standard) ease-(--animation-easing) hover:bg-(--color-sea-serpent-dark)"
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
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
});

Issues.displayName = "Issues";

export default Issues;
