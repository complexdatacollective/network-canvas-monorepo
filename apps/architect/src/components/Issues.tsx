import { map } from 'es-toolkit/compat';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { resolveFieldErrorTarget } from '@codaco/fresco-ui/form/utils/focusFirstError';
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

  // Where the popover hands focus back on close. Base UI restores focus to the
  // trigger by default, which is right for a panel the researcher dismissed
  // and wrong for one whose entire purpose is to SEND them to a control: it
  // left them on "Issues (2)" with the invalid field somewhere below, and —
  // once the panel auto-opens on a failed save — on whatever control
  // `focusFirstError` had already chosen, whichever issue they clicked.
  const finalFocusRef = useRef<HTMLElement | null>(null);

  // Every OPEN clears it, so a panel that is merely dismissed (Escape, a click
  // outside) still returns focus to its trigger. Without this, the control
  // chosen by the last row click would keep taking focus from every later
  // dismissal.
  const setPanelOpen = useCallback((next: boolean) => {
    if (next) finalFocusRef.current = null;
    setOpen(next);
  }, []);

  const openIssues = useCallback(() => {
    if (hasIssues) setPanelOpen(true);
  }, [hasIssues, setPanelOpen]);

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
      // real browser on an invalid Information stage: without this the row
      // read "title - This field is required." — the raw field name — and only
      // re-validating after an edit replaced it. It now harvests to
      // "Page heading - …", because #1400 changed `ArchitectField`'s
      // `IssueAnchor` description from `startCase(name)` to the field's own
      // `label` ("Page heading", sections/Title.tsx), so the panel and the
      // control agree by construction and neither says "Title". Pinned by
      // e2e/specs/issues-panel.spec.ts. A ref callback cannot be early: it
      // runs when the element exists, whenever that turns out to be.
      harvestLabel(el, field);
    },
    [harvestLabel],
  );

  const handleClickIssue = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, field: string) => {
      e.preventDefault();
      // The same resolution an invalid submit uses, so an issue row and a
      // failed save agree about which control owns a field's error —
      // including composite fields that name their own target and Base UI
      // switches, which no plain selector reaches.
      const control = resolveFieldErrorTarget(field);
      const destination = control ?? resolveTarget(field);
      if (!destination) return;

      finalFocusRef.current = control ?? null;
      // Focus first, then scroll, as `focusFirstError` does: a control that
      // scrolls its own internals into view on focus cannot then leave the
      // page somewhere other than where this put it.
      control?.focus({ preventScroll: true });
      scrollTo(destination);
      setOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (submitFailed && hasIssues) {
      setPanelOpen(true);
    }
  }, [submitFailed, hasIssues, setPanelOpen]);

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
      color: 'warning',
      className:
        'aria-expanded:border-warning! aria-expanded:bg-warning! aria-expanded:text-warning-contrast!',
      open,
      onOpenChange: setPanelOpen,
      side: 'top',
      popoverClassName: 'p-0',
      showArrow: true,
      finalFocus: () => finalFocusRef.current ?? true,
      children: (
        <div className="flex flex-col overflow-hidden rounded-[inherit]">
          <div className="flex items-center gap-4 px-5 py-2.5">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="text-sm font-semibold tracking-wider uppercase">
              Issues ({issueCount})
            </span>
          </div>
          <hr className="my-0" />
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
        </div>
      ),
    };
  }, [
    flatIssues,
    handleClickIssue,
    hasIssues,
    issueCount,
    open,
    setIssueRef,
    setPanelOpen,
    submitFailed,
  ]);

  return { segment, openIssues, hasIssues };
}
