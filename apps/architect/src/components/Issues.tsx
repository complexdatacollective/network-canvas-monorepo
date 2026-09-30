import { map } from 'es-toolkit/compat';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { resolveFieldErrorTarget } from '@codaco/fresco-ui/form/utils/focusFirstError';
import {
  ToolbarButton,
  ToolbarPopover,
} from '@codaco/fresco-ui/SegmentedToolbar';
import type { StageProblemsStore } from '@codaco/protocol-builder/stage-editor-contract';

import {
  flattenIssues,
  type IssueTarget,
  resolveIssueTarget,
} from '../utils/issues';
import scrollTo from '../utils/scrollTo';
const messages = defineMessages({
  issueDetail: {
    id: 'architect.presentation.issueDetail',
    defaultMessage: '<fieldLabel>{field}</fieldLabel> - {issue}',
    description:
      'Complete presentation message. Preserve authored values; the translator controls spacing and punctuation.',
  },
  issues: {
    id: 'architect.issues.issues',
    defaultMessage: 'Issues ({issueCount, number})',
    description: 'Visible text in components / Issues.',
  },
});

type UseIssuesToolbarControlResult = {
  control: React.ReactNode;
  openIssues: () => void;
  hasIssues: boolean;
};

/** What each errored field looks like on screen, keyed by the store's key. */
type ResolvedTargets = Record<string, IssueTarget | null>;

/**
 * Whether two resolutions would render the same rows.
 *
 * Only what a row is DRAWN from is compared — whether the field was found at
 * all, what it is called, and the id the row links to. The element itself is
 * not: a re-render that found the same field again is not a change, and the
 * click handler resolves the element afresh anyway. Without this the layout
 * effect below would set state on every commit and loop.
 */
const sameTargets = (a: ResolvedTargets, b: ResolvedTargets): boolean => {
  const fields = Object.keys(b);
  if (Object.keys(a).length !== fields.length) return false;
  return fields.every(
    (field) =>
      Object.hasOwn(a, field) &&
      (a[field] === null) === (b[field] === null) &&
      a[field]?.label === b[field]?.label &&
      a[field]?.anchorId === b[field]?.anchorId,
  );
};

export function useIssuesToolbarControl(
  /**
   * What the protocol refused about the stage that no section answers for.
   * Listed with the field errors because this panel is the only place in
   * Architect they can be read: they belong to no field, so no control shows
   * them, and to no section, so the list beside the form does not either.
   */
  problems: StageProblemsStore,
): UseIssuesToolbarControlResult {
  const intl = useAppIntl();
  // The stage form's field errors are already flat and keyed by field name.
  // The panel only surfaces them once a save has been ATTEMPTED, which the form
  // itself records: `errorFocusRequest` ticks once per submission the form
  // refused, whether its own field validation refused it or the host's submit
  // answered with errors. A successful save clears the errors, so the control
  // goes with them.
  const fieldErrors = useFormStore((state) => state.errors.fieldErrors);
  const submitFailed = useFormStore((state) => state.errorFocusRequest > 0);
  const stageProblems = useSyncExternalStore(
    problems.subscribe,
    problems.getSnapshot,
    problems.getServerSnapshot,
  );
  const flatIssues = useMemo(
    () =>
      [
        ...flattenIssues(fieldErrors),
        // No field of their own: `field` is what a row is resolved and named
        // by, and nothing on screen is what these are about.
        ...stageProblems.map((problem, index) => ({
          id: `stage#${index}`,
          issue: problem,
          field: undefined,
        })),
        // Decoded here rather than where they were raised, so a refusal
        // already on screen follows a change of language. One that was never
        // encoded is already in the reader's language and passes through.
      ].map((issue) => ({
        ...issue,
        issue: formatMessageError(issue.issue, intl) ?? issue.issue,
      })),
    [fieldErrors, intl, stageProblems],
  );
  const hasIssues = flatIssues.length > 0;
  const issueCount = flatIssues.length;

  const [open, setOpen] = useState(false);

  // Where the popover hands focus back on close. Base UI restores focus to the
  // trigger by default, which is right for a panel the researcher dismissed
  // and wrong for one whose entire purpose is to SEND them to a control: it
  // left them on "Issues (2)" with the invalid field somewhere below, and —
  // once the panel auto-opens on a failed save — on whatever control
  // `focusFirstError` had already chosen, whichever issue they clicked.
  const finalFocusRef = useRef<HTMLElement | null>(null);

  const openIssues = useCallback(() => {
    if (hasIssues) setOpen(true);
  }, [hasIssues]);

  const handleClickIssue = useCallback(
    (e: React.MouseEvent<HTMLElement>, field: string) => {
      e.preventDefault();
      // The same resolution an invalid submit uses, so an issue row and a
      // failed save agree about which control owns a field's error —
      // including composite fields that name their own target and Base UI
      // switches, which no plain selector reaches.
      const control = resolveFieldErrorTarget(field);
      const destination = control ?? resolveIssueTarget(field)?.element;
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

  // A save that failed with issues opens the panel. Compared during render
  // rather than opened from an effect: both halves are values this render
  // already has, and the panel then opens in the same commit that reports the
  // failure instead of one frame later. Only the moment the pair BECOMES true
  // opens it, so a panel the researcher dismissed stays dismissed while the
  // same failed save stands.
  const shouldAnnounceIssues = submitFailed && hasIssues;
  const [wasAnnouncingIssues, setWasAnnouncingIssues] = useState(false);
  if (shouldAnnounceIssues !== wasAnnouncingIssues) {
    setWasAnnouncingIssues(shouldAnnounceIssues);
    if (shouldAnnounceIssues) {
      setOpen(true);
    }
  }

  // With nothing to show there is nothing to be open, so the panel's own state
  // is qualified here rather than being reset when the issues clear. The
  // control below renders nothing in that state either way.
  const isOpen = open && hasIssues;

  // Every OPEN clears the focus target above, so a panel that is merely
  // dismissed (Escape, a click outside) still returns focus to its trigger.
  // Without this, the control chosen by the last row click would keep taking
  // focus from every later dismissal. Keyed on the panel actually being open,
  // so the researcher's own open, `openIssues` and the automatic open above
  // are all covered, and a row click's target still survives the close it
  // causes.
  useEffect(() => {
    if (isOpen) {
      finalFocusRef.current = null;
    }
  }, [isOpen]);

  /**
   * What each errored field looks like on screen: the name the researcher
   * knows it by, and an id worth linking to.
   *
   * Read from the FIELDS, which are in the page the whole time, rather than
   * from the rows. The rows used to be rewritten in place from a ref callback
   * precisely because Base UI mounts the popover's portal in a later commit
   * than the one that opens the panel; resolving against the editor instead
   * means the first render of a row already carries its label, and the row's
   * `href` can name something that exists.
   *
   * Re-run on every open as well as on a change of issues: a field inside a
   * section the researcher has since expanded is nowhere to be found the first
   * time and named properly the second.
   */
  const [targets, setTargets] = useState<ResolvedTargets>({});
  useLayoutEffect(() => {
    const resolved: ResolvedTargets = {};
    for (const { field } of flatIssues) {
      if (field === undefined) continue;
      resolved[field] ??= resolveIssueTarget(field);
    }
    setTargets((current) =>
      sameTargets(current, resolved) ? current : resolved,
    );
  }, [flatIssues, isOpen]);

  const control = useMemo<React.ReactNode>(() => {
    if (!hasIssues || !submitFailed) return null;

    return (
      <ToolbarPopover
        key="stage-issues"
        open={isOpen}
        onOpenChange={setOpen}
        contentProps={{
          side: 'top',
          className: 'p-0',
          showArrow: true,
          finalFocus: () => finalFocusRef.current ?? true,
        }}
        trigger={
          <ToolbarButton
            icon={<TriangleAlert />}
            color="warning"
            className="aria-expanded:border-warning! aria-expanded:bg-warning! aria-expanded:text-warning-contrast!"
          >
            {intl.formatMessage(messages.issues, { issueCount: issueCount })}
          </ToolbarButton>
        }
      >
        <div className="flex flex-col overflow-hidden rounded-[inherit]">
          <div className="flex items-center gap-4 px-5 py-2.5">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="text-sm font-semibold tracking-wider uppercase">
              {intl.formatMessage(messages.issues, { issueCount: issueCount })}
            </span>
          </div>
          <hr className="my-0" />
          <ol className="m-0 list-none overflow-y-auto p-0 [counter-reset:issue]">
            {map(flatIssues, ({ id, field, issue }) => {
              // Row identity (`id`) and the field it is about are separate:
              // several rows can share one field, and the target below is
              // resolved once per field.
              const target = field === undefined ? null : targets[field];
              // The frame below names a field, and there is none to name.
              const detail =
                field === undefined
                  ? issue
                  : intl.formatMessage(messages.issueDetail, {
                      // The name on screen, and the store's own key only when
                      // the field is nowhere to be found — at which point the
                      // key is all there is to tell one row from another.
                      field: target?.label ?? field,
                      issue,
                      fieldLabel: (children) => <span>{children}</span>,
                    });
              return (
                <li
                  key={id}
                  data-testid="issue"
                  className="hover:bg-surface-2 m-0 bg-transparent p-0 transition-colors duration-300 ease-in-out"
                >
                  {/*
                    Three shapes, because a row can promise three different
                    things. A field with an id worth naming is an in-page LINK
                    to it, which is what a row has always looked like. A field
                    on screen that owns no id is a button — the row still takes
                    the researcher there, and a keyboard can still reach it,
                    which an `<a>` with no `href` cannot. A field that is not
                    in the DOM at all is neither: it used to be an `<a
                    href="#field_prompts">` pointing at an id nothing renders,
                    announced as a link and offered to "open in a new tab",
                    and it went nowhere when taken. A refusal about no field
                    at all takes that last shape too: nowhere to send anybody.
                  */}
                  {field === undefined ||
                  target === null ||
                  target === undefined ? (
                    <span className="block w-full px-5 py-2.5 before:mr-2.5 before:[content:counter(issue)_'.'] before:[counter-increment:issue]">
                      {detail}
                    </span>
                  ) : target.anchorId === undefined ? (
                    <button
                      type="button"
                      onClick={(e) => handleClickIssue(e, field)}
                      className="block w-full px-5 py-2.5 text-left before:mr-2.5 before:[content:counter(issue)_'.'] before:[counter-increment:issue]"
                    >
                      {detail}
                    </button>
                  ) : (
                    <a
                      href={`#${target.anchorId}`}
                      onClick={(e) => handleClickIssue(e, field)}
                      className="block w-full px-5 py-2.5 no-underline before:mr-2.5 before:[content:counter(issue)_'.'] before:[counter-increment:issue]"
                    >
                      {detail}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </ToolbarPopover>
    );
  }, [
    flatIssues,
    handleClickIssue,
    hasIssues,
    isOpen,
    issueCount,
    submitFailed,
    targets,
    intl,
  ]);

  return { control, openIssues, hasIssues };
}
