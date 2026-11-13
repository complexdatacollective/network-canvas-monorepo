import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import Pips from '@codaco/fresco-ui/Pips';
import { PopoverTitle } from '@codaco/fresco-ui/Popover';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import RichTextField from '@codaco/protocol-builder/fields/RichTextField';
import { useLanguageName } from '~/components/Localization/useLanguageName';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import {
  type DecisionRefusal,
  decideFinding,
  getProtocolReviewFindings,
  type ReviewFindingView,
  undoFix,
} from '~/ducks/modules/protocolReview';
import type { FixTextEdit } from '~/protocolReview/describeFix';
import type { FindingDecision } from '~/protocolReview/reviewStore';

import {
  ChangeLabel,
  fixEditMessages,
  FixText,
  NowBox,
  useFixEditContexts,
} from './fixEditText';
import { GuardedButton, ProtocolPlaceLink } from './reviewControls';
import {
  categoryMessage,
  formatLocation,
  formatLocationLink,
  severityMessage,
  SeverityLabel,
} from './reviewText';

const messages = defineMessages({
  problemOf: {
    id: 'architect.protocolReview.problem.problemOf',
    defaultMessage: 'Problem {position, number} of {total, number}',
    description:
      'Shows which problem found by the automated protocol review is open, when going through them one at a time.',
  },
  explanation: {
    id: 'architect.protocolReview.problem.suggestedFix',
    defaultMessage: 'Suggested fix',
    description:
      'Heading of the part of a problem that describes how the automated protocol review suggests fixing it.',
  },
  otherTranslations: {
    id: 'architect.protocolReview.problem.otherTranslations',
    defaultMessage:
      'This protocol also has this text in {languages}. Fix for me does not change {count, plural, one {that version} other {those versions}}, so check {count, plural, one {it} other {them}} after the fix.',
    description:
      'Note under a suggested change to a text that the protocol also has in other languages. {languages} is a list of language names, already joined for the reader’s language (for example "Spanish and French"); {count} is how many. "Fix for me" is the name of a button and must match its translation.',
  },
  changed: {
    id: 'architect.protocolReview.problem.changed',
    defaultMessage:
      'This fix can no longer be made for you, because that part of the protocol changed after the review. Make the change yourself, using the description below.',
    description:
      'Notice on a problem whose suggested fix no longer fits the protocol, because the researcher has since changed what it would edit.',
  },
  cannotFix: {
    id: 'architect.protocolReview.problem.cannotFix',
    defaultMessage:
      'This fix cannot be made for you. Make the change yourself, using the description below.',
    description:
      'Notice on a problem whose suggested fix Architect cannot apply automatically.',
  },
  notOwned: {
    id: 'architect.protocolReview.problem.notOwned',
    defaultMessage:
      'This protocol is open for editing in another tab, so it cannot be changed here. Make the change in that tab.',
    description:
      'Notice when Fix for me was refused because another browser tab holds this protocol for editing.',
  },
  notUpdated: {
    id: 'architect.protocolReview.problem.notUpdated',
    defaultMessage:
      'That choice could not be saved, because the review changed in the meantime. Go back and open the problem again.',
    description:
      'Notice when a choice about a problem could not be recorded because the review it belongs to was replaced or the problem was already fixed. "Back" is the name of the button that returns to the list of problems.',
  },
  fixedState: {
    id: 'architect.protocolReview.problem.fixedState',
    defaultMessage:
      'This was fixed for you. Undo takes the change back out of your protocol.',
    description:
      'Notice on a problem the researcher already chose Fix for me for, while that change is still in the protocol. "Undo" is the name of a button.',
  },
  fixedNoUndo: {
    id: 'architect.protocolReview.problem.fixedNoUndo',
    defaultMessage:
      'This was fixed for you. You have changed that part of the protocol since, so the fix cannot be undone from here; use Undo in the toolbar instead.',
    description:
      'Notice on a problem fixed for the researcher whose change can no longer be taken back from the review, only with the app’s ordinary Undo button.',
  },
  mineState: {
    id: 'architect.protocolReview.problem.mineState',
    defaultMessage: 'You chose to fix this yourself.',
    description:
      'Notice on a problem the researcher already chose "Fix it myself" for. A link to where the problem is may follow it.',
  },
  doneState: {
    id: 'architect.protocolReview.problem.doneState',
    defaultMessage: 'You fixed this yourself.',
    description:
      'Notice on a problem the researcher chose to fix themselves and then marked Done. A link to where the problem is may follow it.',
  },
  dismissedState: {
    id: 'architect.protocolReview.problem.dismissedState',
    defaultMessage: 'You dismissed this problem.',
    description: 'Notice on a problem the researcher already dismissed.',
  },
  back: {
    id: 'architect.protocolReview.problem.back',
    defaultMessage: 'Back',
    description:
      'Button on one problem found by the automated protocol review that returns to the list of all the problems.',
  },
  dismiss: {
    id: 'architect.protocolReview.problem.dismiss',
    defaultMessage: 'Dismiss',
    description:
      'Button that puts a problem found by the automated protocol review away without changing anything, and moves to the next problem.',
  },
  mine: {
    id: 'architect.protocolReview.problem.mine',
    defaultMessage: 'Fix it myself',
    description:
      'Button that keeps a problem on the researcher’s list, for them to fix themselves, and takes them to the stage or codebook entry it is about, where the suggested change stays in view. On a problem about the whole protocol, it moves to the next problem instead.',
  },
  done: {
    id: 'architect.protocolReview.problem.done',
    defaultMessage: 'Done',
    description:
      'Button on a problem the researcher chose to fix themselves, pressed once they have made the change. The problem then shows as fixed by them.',
  },
  notDone: {
    id: 'architect.protocolReview.problem.notDone',
    defaultMessage: 'Not done yet',
    description:
      'Button on a problem the researcher marked Done that returns it to the problems for them to fix.',
  },
  editValue: {
    id: 'architect.protocolReview.problem.editValue',
    defaultMessage: 'Edit',
    description:
      'Button in the After the fix box that lets the researcher change the suggested text or number before the fix is made.',
  },
  useSuggestion: {
    id: 'architect.protocolReview.problem.useSuggestion',
    defaultMessage: 'Use suggestion',
    description:
      'Button that puts back the suggested text or number after the researcher changed it, before the fix is made.',
  },
  notANumber: {
    id: 'architect.protocolReview.problem.notANumber',
    defaultMessage: 'Enter a number.',
    description:
      'Shown under a number the researcher is changing before the fix is made, when the field does not hold a number.',
  },
  editedInvalid: {
    id: 'architect.protocolReview.problem.editedInvalid',
    defaultMessage:
      'Your changes would leave the protocol invalid. Change them, or use the suggestion.',
    description:
      'Notice when Fix for me is pressed with text or numbers the researcher changed, and the result would not be a valid protocol.',
  },
  fixForMe: {
    id: 'architect.protocolReview.problem.fixForMe',
    defaultMessage: 'Fix for me',
    description:
      'Button that makes the suggested fix in the protocol now (it can be undone), and moves to the next problem.',
  },
  checkingFix: {
    id: 'architect.protocolReview.problem.checkingFix',
    defaultMessage: 'Checking whether this fix can be made for you…',
    description:
      'Read by screen readers with the Fix for me button while Architect works out whether the fix leaves a valid protocol.',
  },
  undo: {
    id: 'architect.protocolReview.problem.undo',
    defaultMessage: 'Undo',
    description:
      'Button that takes a fix made for the researcher back out of the protocol.',
  },
  undoDismiss: {
    id: 'architect.protocolReview.problem.undoDismiss',
    defaultMessage: 'Undo dismiss',
    description:
      'Button on a problem the researcher dismissed that returns it to the problems still to decide.',
  },
  nextProblem: {
    id: 'architect.protocolReview.problem.nextProblem',
    defaultMessage: 'Next problem',
    description:
      'Button that moves on from a problem already fixed to the next problem still to decide.',
  },
  fixApplied: {
    id: 'architect.protocolReview.problem.fixApplied',
    defaultMessage: 'Fixed for you: {title}',
    description:
      'Read by screen readers after Fix for me changed the protocol. {title} is the problem’s title, written by the review service.',
  },
  fixUndone: {
    id: 'architect.protocolReview.problem.fixUndone',
    defaultMessage: 'Fix undone: {title}',
    description:
      'Read by screen readers after a fix made for the researcher was taken back out. {title} is the problem’s title, written by the review service.',
  },
  allDecided: {
    id: 'architect.protocolReview.problem.allDecided',
    defaultMessage:
      'You have been through every problem. Back at the list of problems.',
    description:
      'Read by screen readers when the researcher decides about the last problem still open and the panel returns to the list of all the problems.',
  },
});

/** The next problem still to decide after `fromIndex`, wrapping round. */
const nextUndecided = (
  findings: readonly ReviewFindingView[],
  fromIndex: number,
  excludeId: string,
): ReviewFindingView | null => {
  for (let step = 1; step <= findings.length; step += 1) {
    const candidate = findings[(fromIndex + step) % findings.length];
    if (candidate?.status === 'undecided' && candidate.id !== excludeId) {
      return candidate;
    }
  }
  return null;
};

const TextEditor = ({
  edit,
  labelledBy,
  describedBy,
  value,
  onChange,
}: {
  edit: FixTextEdit;
  labelledBy: string;
  describedBy: string;
  value: string;
  onChange: (value: string | undefined) => void;
}) => {
  const id = useId();
  if (edit.markdown) {
    return (
      // A text of several lines gets the editor's whole toolbar, which is
      // wider than the panel: the panel widens while it is open
      // (`data-wide-editor`, read by the panel's frame).
      <div
        data-wide-editor={edit.singleLine ? undefined : ''}
        className="min-w-0"
      >
        <RichTextField
          id={id}
          name={id}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          value={value}
          onChange={(next) => onChange(next ?? '')}
          singleLine={edit.singleLine}
        />
      </div>
    );
  }
  return edit.singleLine ? (
    <InputField
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      value={value}
      onChange={(next) => onChange(next ?? '')}
    />
  ) : (
    <TextAreaField
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="[&>textarea]:field-sizing-content [&>textarea]:min-h-24"
      value={value}
      onChange={(next) => onChange(next ?? '')}
    />
  );
};

const AfterFixBox = ({
  edit,
  contextId,
  describedBy,
  label,
  editLabel,
  resetLabel,
  notANumber,
  editable,
  value,
  onChange,
}: {
  edit: FixTextEdit;
  contextId?: string;
  /** What the text is now, or else what the fix does. */
  describedBy: string;
  label: string;
  editLabel: string;
  resetLabel: string;
  notANumber: string;
  editable: boolean;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) => {
  const labelId = useId();
  const errorId = useId();
  const editing = editable && value !== undefined;
  const invalid = editing && !editIsValid(edit, value);
  const labelledBy = contextId ? `${contextId} ${labelId}` : labelId;
  return (
    <div className="flex flex-col gap-2">
      {/* As tall as its label, as Now's is: the button overhangs it rather
          than setting its height. */}
      <div className="flex items-center justify-between gap-2">
        <ChangeLabel id={labelId} side="after">
          {label}
        </ChangeLabel>
        {editable && (
          <Button
            size="sm"
            variant="text"
            className="-my-2"
            onClick={() => onChange(editing ? undefined : edit.after)}
          >
            {editing ? resetLabel : editLabel}
          </Button>
        )}
      </div>
      <div
        className={
          // The editor draws its own field, so it is not boxed again.
          editing ? undefined : 'bg-surface border-primary rounded border-2 p-4'
        }
      >
        {editing ? (
          edit.kind === 'number' ? (
            <InputField
              type="number"
              aria-labelledby={labelledBy}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              value={value}
              onChange={(next) => onChange(next ?? '')}
            />
          ) : (
            <TextEditor
              edit={edit}
              labelledBy={labelledBy}
              describedBy={describedBy}
              value={value}
              onChange={onChange}
            />
          )
        ) : (
          <FixText text={edit.after} markdown={edit.markdown} />
        )}
      </div>
      {invalid && (
        <span id={errorId} className="text-destructive text-sm">
          {notANumber}
        </span>
      )}
    </div>
  );
};

const editIsValid = (edit: FixTextEdit, value: string) =>
  edit.kind === 'text' ||
  (value.trim() !== '' && Number.isFinite(Number(value)));

type Refusal = {
  findingId: string;
  reason: DecisionRefusal;
  edited: boolean;
};

const refusalMessages: Record<DecisionRefusal, MessageDescriptor> = {
  not_owned: messages.notOwned,
  changed: messages.changed,
  invalid: messages.cannotFix,
  fixed: messages.notUpdated,
  not_fixed: messages.notUpdated,
  no_review: messages.notUpdated,
  not_found: messages.notUpdated,
};

type ReviewProblemViewProps = {
  /** The problem shown. */
  finding: ReviewFindingView;
  /** Its place among all the problems, from 0. */
  index: number;
  total: number;
  /** Shows another problem in its place. */
  onOpenFinding: (findingId: string) => void;
  /** Returns the panel to the list of problems. */
  onBack: () => void;
  /** Closes the panel. */
  onClose: () => void;
  announce: (message: string) => void;
};

/**
 * One problem, in the review panel: what is wrong, the suggested fix, and the
 * choices about it. Each choice moves on to the next problem still to decide,
 * and the last one returns to the list.
 */
const ReviewProblemView = ({
  finding: current,
  index,
  total,
  onOpenFinding,
  onBack,
  onClose,
  announce,
}: ReviewProblemViewProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [, navigate] = useLocation();
  const languageName = useLanguageName();
  const editContexts = useFixEditContexts(current.textEdits);
  const anotherUndecided = useAppSelector(
    (state) =>
      nextUndecided(getProtocolReviewFindings(state), index, current.id) !==
      null,
  );
  const checkingId = useId();
  const summaryId = useId();

  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});
  const editsValid = current.textEdits.every((edit) => {
    const value = edits[edit.path];
    return value === undefined || editIsValid(edit, value);
  });

  // Each problem takes focus at its title as it arrives (the panel mounts
  // this afresh for each one), so a keyboard or screen reader user starts
  // reading the new problem from its top, wherever the button they pressed
  // was.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const moveOn = () => {
    const latest = getProtocolReviewFindings(store.getState());
    const next = nextUndecided(latest, index, current.id);
    if (next) {
      onOpenFinding(next.id);
      return;
    }
    announce(intl.formatMessage(messages.allDecided));
    onBack();
  };

  /**
   * After a choice other than Fix for me: `next` moves on to the next
   * problem, `stay` keeps this one open, and `place` takes the researcher to
   * where it is (or moves on, when it is about the whole protocol).
   */
  const decide = async (
    decision: FindingDecision,
    after: 'next' | 'stay' | 'place' = 'next',
  ) => {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const edited = decision === 'fix' && Object.keys(edits).length > 0;
    const result = await dispatch(
      decideFinding(current.id, decision, decision === 'fix' ? edits : {}),
    );
    setBusy(false);
    if (!result.ok) {
      setRefusal({ findingId: current.id, reason: result.reason, edited });
      return;
    }
    if (decision === 'fix') {
      setEdits({});
      announce(
        intl.formatMessage(messages.fixApplied, { title: current.title }),
      );
      titleRef.current?.focus({ preventScroll: true });
      // Back to the top, where the notice says it was fixed and how to undo it.
      scrollRef.current?.scrollTo({
        top: 0,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      return;
    }
    if (after === 'stay') return;
    const place = formatLocationLink(intl, current.fixPlace);
    if (after === 'place' && place) {
      onClose();
      navigate(place.href);
      return;
    }
    moveOn();
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await dispatch(undoFix(current.id));
    setBusy(false);
    if (!result.ok) {
      setRefusal({
        findingId: current.id,
        reason: result.reason,
        edited: false,
      });
      return;
    }
    announce(intl.formatMessage(messages.fixUndone, { title: current.title }));
  };

  const shownRefusal =
    refusal?.findingId === current.id ? refusal.reason : null;
  const refusalNotice =
    shownRefusal === 'invalid' && refusal?.edited
      ? messages.editedInvalid
      : shownRefusal
        ? refusalMessages[shownRefusal]
        : null;
  const { status, availability } = current;
  const undecidedOrMine = status === 'undecided' || status === 'mine';
  const fixBlocked =
    availability === 'changed' ||
    availability === 'invalid' ||
    availability === 'none';
  const availabilityNotice =
    status !== 'fixed' && availability === 'changed'
      ? messages.changed
      : status !== 'fixed' && fixBlocked
        ? messages.cannotFix
        : null;
  const notices = [
    ...(refusalNotice ? [refusalNotice] : []),
    ...(availabilityNotice ? [availabilityNotice] : []),
  ].filter((notice, position, all) => all.indexOf(notice) === position);
  const stateNotice =
    status === 'fixed'
      ? current.canUndo
        ? messages.fixedState
        : current.decision === 'fix'
          ? messages.fixedNoUndo
          : null
      : status === 'mine'
        ? messages.mineState
        : status === 'done'
          ? messages.doneState
          : status === 'dismissed'
            ? messages.dismissedState
            : null;
  const stateNoticeLinks =
    status === 'fixed' || status === 'mine' || status === 'done';
  const location = formatLocation(intl, current.location);
  const link = formatLocationLink(intl, current.location);
  // Where the researcher would make the fix, which the notices link to.
  const fixLink = formatLocationLink(intl, current.fixPlace);
  // Once the researcher chose to fix it themselves, saying they did is the
  // thing to do next, not having it fixed for them.
  const fixPrimary =
    status !== 'mine' && (current.canFix || availability === 'checking');
  const canChooseFix = undecidedOrMine || status === 'dismissed';
  const canEditFix = canChooseFix && availability === 'available';

  const fixButton = canChooseFix ? (
    <GuardedButton
      color={fixPrimary ? 'primary' : 'default'}
      unavailable={busy || availability !== 'available' || !editsValid}
      aria-describedby={availability === 'checking' ? checkingId : undefined}
      icon={
        availability === 'checking' ? (
          <Loader2 className="motion-safe:animate-spin" aria-hidden />
        ) : undefined
      }
      onClick={() => void decide('fix')}
    >
      {intl.formatMessage(messages.fixForMe)}
    </GuardedButton>
  ) : null;

  return (
    <>
      <div className="flex flex-col gap-3 px-6 pt-6 pb-4">
        <div className="flex items-start gap-4">
          <PopoverTitle
            render={
              <Heading
                ref={titleRef}
                tabIndex={-1}
                level="h2"
                margin="none"
                className="min-w-0 flex-1 text-xl wrap-break-word outline-none"
              />
            }
          >
            {current.title}
          </PopoverTitle>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <SeverityLabel severity={current.severity}>
            {intl.formatMessage(severityMessage(current.severity))}
          </SeverityLabel>
          <span className="font-bold">
            {intl.formatMessage(categoryMessage(current.category))}
          </span>
        </div>
        <div className="text-sm">
          {link ? (
            <ProtocolPlaceLink href={link.href} onFollow={onClose}>
              {location}
            </ProtocolPlaceLink>
          ) : (
            <span>{location}</span>
          )}
        </div>
      </div>
      <ScrollArea ref={scrollRef} className="min-h-0 flex-1" fade>
        <div className="@container px-6 pb-4">
          <div className="flex flex-col gap-4">
            <Paragraph margin="none">{current.explanation}</Paragraph>
            {stateNotice && (
              <Alert variant="info" density="compact" className="my-0">
                <AlertDescription>
                  {intl.formatMessage(stateNotice)}
                  {stateNoticeLinks && fixLink && (
                    <>
                      {' '}
                      <ProtocolPlaceLink href={fixLink.href} onFollow={onClose}>
                        {fixLink.label}
                      </ProtocolPlaceLink>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {notices.map((notice) => (
              <Alert
                key={notice.id}
                variant="warning"
                density="compact"
                className="my-0"
              >
                <AlertDescription>
                  {intl.formatMessage(notice)}
                </AlertDescription>
              </Alert>
            ))}
            <section className="bg-surface-1 flex flex-col gap-3 rounded p-4">
              <Heading
                level="h3"
                variant="all-caps"
                margin="none"
                className="text-sm"
              >
                {intl.formatMessage(messages.explanation)}
              </Heading>
              <Paragraph id={summaryId} margin="none">
                {current.fixSummary}
              </Paragraph>
              {current.fixChanges.length > 0 && (
                <ul className="m-0 flex list-disc flex-col gap-1 ps-6">
                  {current.fixChanges.map((change, position) => (
                    // The service's own sentences, which may repeat.
                    // oxlint-disable-next-line react/no-array-index-key -- the list is fixed for the life of the review
                    <li key={position}>{change}</li>
                  ))}
                </ul>
              )}
              {current.textEdits.map((edit) => (
                <div key={edit.path} className="mt-4 flex flex-col gap-3">
                  {editContexts[edit.path] && (
                    <span
                      id={`${current.id}${edit.path}-context`}
                      className="text-sm font-bold"
                    >
                      {editContexts[edit.path]}
                    </span>
                  )}
                  <div className="flex flex-col gap-4">
                    <NowBox id={`${current.id}${edit.path}-now`} edit={edit} />
                    <AfterFixBox
                      edit={edit}
                      contextId={
                        editContexts[edit.path]
                          ? `${current.id}${edit.path}-context`
                          : undefined
                      }
                      describedBy={
                        edit.now === null
                          ? summaryId
                          : `${current.id}${edit.path}-now`
                      }
                      label={intl.formatMessage(fixEditMessages.afterFix)}
                      editLabel={intl.formatMessage(messages.editValue)}
                      resetLabel={intl.formatMessage(messages.useSuggestion)}
                      notANumber={intl.formatMessage(messages.notANumber)}
                      editable={canEditFix && edit.editable}
                      value={edits[edit.path]}
                      onChange={(value) =>
                        setEdits((previous) => {
                          if (value !== undefined) {
                            return { ...previous, [edit.path]: value };
                          }
                          const { [edit.path]: _removed, ...rest } = previous;
                          return rest;
                        })
                      }
                    />
                  </div>
                  {edit.otherTranslations.length > 0 && (
                    <Paragraph intent="smallText" margin="none">
                      {intl.formatMessage(messages.otherTranslations, {
                        languages: intl.formatList(
                          edit.otherTranslations.map((locale) =>
                            languageName(locale),
                          ),
                          { type: 'conjunction' },
                        ),
                        count: edit.otherTranslations.length,
                      })}
                    </Paragraph>
                  )}
                </div>
              ))}
            </section>
            {availability === 'checking' && (
              <span id={checkingId} className="sr-only">
                {intl.formatMessage(messages.checkingFix)}
              </span>
            )}
          </div>
        </div>
      </ScrollArea>
      <div className="border-outline flex flex-col gap-3 border-t px-6 py-4">
        <div className="flex items-center gap-4">
          <IconButton
            variant="text"
            icon={<ArrowLeft className="rtl:rotate-180" />}
            aria-label={intl.formatMessage(messages.back)}
            onClick={onBack}
          />
          <span aria-hidden className="min-w-0 flex-1">
            <Pips small count={total} currentIndex={index} />
          </span>
          <span className="shrink-0 text-xs font-bold tracking-widest uppercase">
            {intl.formatMessage(messages.problemOf, {
              position: index + 1,
              total,
            })}
          </span>
        </div>
        {/* The quiet choices on the reading edge, the main ones on the other,
            which stay there when there are too many for one row. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="me-auto flex flex-wrap items-center gap-2">
            {status === 'done' ? (
              <GuardedButton
                variant="text"
                unavailable={busy}
                onClick={() => void decide('mine', 'stay')}
              >
                {intl.formatMessage(messages.notDone)}
              </GuardedButton>
            ) : status === 'fixed' ? null : (
              <>
                {status === 'dismissed' && (
                  <GuardedButton
                    variant="text"
                    unavailable={busy}
                    onClick={() => void decide('undecided', 'stay')}
                  >
                    {intl.formatMessage(messages.undoDismiss)}
                  </GuardedButton>
                )}
                {status !== 'dismissed' && (
                  <GuardedButton
                    variant="text"
                    unavailable={busy}
                    onClick={() => void decide('dismissed')}
                  >
                    {intl.formatMessage(messages.dismiss)}
                  </GuardedButton>
                )}
              </>
            )}
          </div>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
            {status === 'fixed' ? (
              <>
                {current.canUndo && (
                  <GuardedButton unavailable={busy} onClick={() => void undo()}>
                    {intl.formatMessage(messages.undo)}
                  </GuardedButton>
                )}
                {anotherUndecided && (
                  <Button color="primary" onClick={moveOn}>
                    {intl.formatMessage(messages.nextProblem)}
                  </Button>
                )}
              </>
            ) : status === 'done' ? (
              anotherUndecided && (
                <Button color="primary" onClick={moveOn}>
                  {intl.formatMessage(messages.nextProblem)}
                </Button>
              )
            ) : (
              <>
                {status === 'mine' ? (
                  <GuardedButton
                    color="primary"
                    unavailable={busy}
                    onClick={() => void decide('done')}
                  >
                    {intl.formatMessage(messages.done)}
                  </GuardedButton>
                ) : (
                  <GuardedButton
                    color={fixPrimary ? 'default' : 'primary'}
                    unavailable={busy}
                    onClick={() => void decide('mine', 'place')}
                  >
                    {intl.formatMessage(messages.mine)}
                  </GuardedButton>
                )}
                {fixButton}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ReviewProblemView;
