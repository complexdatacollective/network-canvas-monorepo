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

  // Field display labels live in the DOM, so a row's own label is only
  // discoverable once that row's field anchor is mounted. Reads `data-name`
  // (set by IssueAnchor) or the anchor's text, and rewrites the row in place.
  // Idempotent: writing the same label twice is a no-op, which is what lets
  // both callers below run freely.
  const harvestLabel = useCallback((el: HTMLElement | null, field: string) => {
    if (!el) return;
    const targetField = resolveTarget(field);
    if (!targetField) return;
    const fieldName =
      targetField.getAttribute('data-name') || targetField.textContent;
    if (fieldName) el.textContent = fieldName;
  }, []);

  // Keyed by the row's own id rather than its field id: a field that fails
  // several rules has one row per message, and they must not share a slot.
  const setIssueRef = useCallback(
    (el: HTMLElement | null, id: string, field: string) => {
      issueRefs.current[id] = el;
      // Harvest HERE, as the row mounts, not only from the effect below. Base
      // UI mounts the popover's portal in a later commit than the one that
      // flips `open`, so on a first open the effect runs while `issueRefs` is
      // still empty and every row keeps its raw internal path. Verified in a
      // real browser: submitting an invalid Information stage listed
      // "title - This field is required.", and only re-validating after an
      // edit turned it into "Title - …". A ref callback cannot be early: it
      // runs when the element exists, whenever that turns out to be.
      harvestLabel(el, field);
    },
    [harvestLabel],
  );

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

  // Second pass, for a label that was not resolvable when its row mounted —
  // an anchor inside a section that has since expanded, say. The ref callback
  // above is what covers the ordinary first open.
  useEffect(() => {
    if (!open) return;
    flatIssues.forEach(({ id, field }) => {
      harvestLabel(issueRefs.current[id] ?? null, field);
    });
  }, [flatIssues, harvestLabel, open]);

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
                    <span ref={(el) => setIssueRef(el, id, field)}>
                      {field}
                    </span>{' '}
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
