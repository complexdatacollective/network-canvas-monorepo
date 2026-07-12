import { map } from 'es-toolkit/compat';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { getFormSyncErrors, hasSubmitFailed } from 'redux-form';

import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';

import { candidateIdsFor, flattenIssues, getFieldId } from '../utils/issues';
import scrollTo from '../utils/scrollTo';
import { formName } from './StageEditor/configuration';

type UseIssuesToolbarSegmentResult = {
  segment: ToolbarSegment | null;
  openIssues: () => void;
  hasIssues: boolean;
};

const resolveTarget = (field: string): HTMLElement | null => {
  for (const id of candidateIdsFor(field)) {
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) {
      return el;
    }
  }
  return null;
};

export function useIssuesToolbarSegment(): UseIssuesToolbarSegmentResult {
  const formErrors = useSelector(getFormSyncErrors(formName));
  const submitFailed = useSelector(hasSubmitFailed(formName));
  const issues = formErrors as Record<string, unknown>;
  const flatIssues = useMemo(() => flattenIssues(issues), [issues]);
  const hasIssues = flatIssues.length > 0;
  const issueCount = flatIssues.length;

  const [open, setOpen] = useState(false);
  const issueRefs = useRef<Record<string, HTMLElement | null>>({});

  const openIssues = useCallback(() => {
    if (hasIssues) setOpen(true);
  }, [hasIssues]);

  const setIssueRef = useCallback((el: HTMLElement | null, fieldId: string) => {
    issueRefs.current[fieldId] = el;
  }, []);

  const handleClickIssue = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, field: string) => {
      e.preventDefault();
      const destination = resolveTarget(field);
      if (destination) {
        scrollTo(destination);
        setOpen(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (submitFailed && hasIssues) {
      setOpen(true);
    }
  }, [submitFailed, hasIssues]);

  useEffect(() => {
    if (!hasIssues) setOpen(false);
  }, [hasIssues]);

  // Field display labels live in the DOM; harvest friendly names from each field's
  // data-name/textContent so the list reads as a label rather than an internal path.
  // `open` is a dep because the issue refs are only mounted while the popover is open.
  useEffect(() => {
    if (!open) return;
    flatIssues.forEach(({ field }: { field: string; issue: string }) => {
      const fieldId = getFieldId(field);
      // Resolve via the same ancestor-aware lookup the click handler uses, so
      // fields only reachable through a trimmed ancestor candidate still get a
      // friendly label instead of leaving the raw path in the list.
      const targetField = resolveTarget(field);
      if (!targetField) return;
      const fieldName =
        targetField.getAttribute('data-name') || targetField.textContent;
      if (fieldName && issueRefs?.current[fieldId]) {
        issueRefs.current[fieldId].textContent = fieldName;
      }
    });
  }, [flatIssues, open]);

  const segment = useMemo<ToolbarSegment | null>(() => {
    if (!hasIssues || !submitFailed) return null;

    return {
      type: 'popover',
      id: 'issues',
      label: `Issues (${issueCount})`,
      icon: <TriangleAlert />,
      showLabel: true,
      open,
      onOpenChange: setOpen,
      side: 'top',
      children: (
        <>
          <div className="border-outline flex items-center gap-5 border-b px-5 py-3">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="text-sm font-semibold tracking-wider uppercase">
              Issues ({issueCount})
            </span>
          </div>
          <ol className="m-0 list-none overflow-y-auto p-0 [counter-reset:issue]">
            {map(flatIssues, ({ field, issue }) => {
              const fieldId = getFieldId(field);
              return (
                <li
                  key={fieldId}
                  data-testid="issue"
                  className="hover:bg-surface-2 m-0 bg-transparent p-0 transition-colors duration-300 ease-in-out"
                >
                  <a
                    href={`#${fieldId}`}
                    onClick={(e) => handleClickIssue(e, field)}
                    className="block w-full px-5 py-2.5 no-underline before:mr-2.5 before:[content:counter(issue)_'.'] before:[counter-increment:issue]"
                  >
                    <span ref={(el) => setIssueRef(el, fieldId)}>{field}</span>{' '}
                    - {issue}
                  </a>
                </li>
              );
            })}
          </ol>
        </>
      ),
    };
  }, [
    flatIssues,
    handleClickIssue,
    hasIssues,
    issueCount,
    open,
    setIssueRef,
    submitFailed,
  ]);

  return { segment, openIssues, hasIssues };
}
