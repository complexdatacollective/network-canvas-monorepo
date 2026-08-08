import { map } from 'es-toolkit/compat';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';

import { candidateIdsFor, flattenIssues, getFieldId } from '../utils/issues';
import scrollTo from '../utils/scrollTo';
import { useStageFormContext } from './StageEditor/stageFormContext';

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
  // The stage form's field errors are already flat and keyed by field name;
  // `submitFailed` is tracked by the stage form bridge because the panel only
  // surfaces issues once a save has been attempted.
  const fieldErrors = useFormStore((state) => state.errors.fieldErrors);
  const { submitFailed } = useStageFormContext();
  const flatIssues = useMemo(() => flattenIssues(fieldErrors), [fieldErrors]);
  const hasIssues = flatIssues.length > 0;
  const issueCount = flatIssues.length;

  const [open, setOpen] = useState(false);
  const issueRefs = useRef<Record<string, HTMLElement | null>>({});

  const openIssues = useCallback(() => {
    if (hasIssues) setOpen(true);
  }, [hasIssues]);

  // Keyed by the row's own id rather than its field id: a field that fails
  // several rules has one row per message, and they must not share a slot.
  const setIssueRef = useCallback((el: HTMLElement | null, id: string) => {
    issueRefs.current[id] = el;
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
    flatIssues.forEach(({ id, field }) => {
      // Resolve via the same ancestor-aware lookup the click handler uses, so
      // fields only reachable through a trimmed ancestor candidate still get a
      // friendly label instead of leaving the raw path in the list.
      const targetField = resolveTarget(field);
      if (!targetField) return;
      const fieldName =
        targetField.getAttribute('data-name') || targetField.textContent;
      if (fieldName && issueRefs?.current[id]) {
        issueRefs.current[id].textContent = fieldName;
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
            {map(flatIssues, ({ id, field, issue }) => {
              // Row identity (`id`) and anchor target (`fieldId`) are separate:
              // several rows can share one field, and scroll-to-error resolves
              // through the field path.
              const fieldId = getFieldId(field);
              return (
                <li
                  key={id}
                  data-testid="issue"
                  className="hover:bg-surface-2 m-0 bg-transparent p-0 transition-colors duration-300 ease-in-out"
                >
                  <a
                    href={`#${fieldId}`}
                    onClick={(e) => handleClickIssue(e, field)}
                    className="block w-full px-5 py-2.5 no-underline before:mr-2.5 before:[content:counter(issue)_'.'] before:[counter-increment:issue]"
                  >
                    <span ref={(el) => setIssueRef(el, id)}>{field}</span> -{' '}
                    {issue}
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
