import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Pips from '@codaco/fresco-ui/Pips';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useLanguageName } from '~/components/Localization/useLanguageName';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import {
  checkFixAvailability,
  type DecisionRefusal,
  decideFinding,
  getProtocolReviewCounts,
  getProtocolReviewFindings,
  type ReviewFindingView,
  undoFix,
} from '~/ducks/modules/protocolReview';
import type { FindingDecision } from '~/protocolReview/reviewStore';
import { getProtocol } from '~/selectors/protocol';

import { GuardedButton, ProtocolPlaceLink } from './reviewControls';
import {
  categoryMessage,
  formatLocation,
  formatLocationLink,
  severityMessage,
  SeverityLabel,
} from './reviewText';
import type { ReviewAvailability } from './useReviewAvailability';

const messages = defineMessages({
  problemOf: {
    id: 'architect.protocolReview.dialog.problemOf',
    defaultMessage: 'Problem {position, number} of {total, number}',
    description:
      'Shows which problem found by the automated protocol review is open, when going through them one at a time.',
  },
  explanation: {
    id: 'architect.protocolReview.dialog.suggestedFix',
    defaultMessage: 'Suggested fix',
    description:
      'Heading of the part of a problem that describes how the automated protocol review suggests fixing it.',
  },
  now: {
    id: 'architect.protocolReview.dialog.now',
    defaultMessage: 'Now',
    description:
      'Label over a piece of text as it is in the protocol now, shown beside the same text as the suggested fix would change it.',
  },
  afterFix: {
    id: 'architect.protocolReview.dialog.afterFix',
    defaultMessage: 'After the fix',
    description:
      'Label over a piece of text as the suggested fix would change it.',
  },
  otherTranslations: {
    id: 'architect.protocolReview.dialog.otherTranslations',
    defaultMessage:
      'This protocol also has this text in {languages}. Fix for me does not change {count, plural, one {that version} other {those versions}}, so check {count, plural, one {it} other {them}} after the fix.',
    description:
      'Note under a suggested change to a text that the protocol also has in other languages. {languages} is a list of language names, already joined for the reader’s language (for example "Spanish and French"); {count} is how many. "Fix for me" is the name of a button and must match its translation.',
  },
  changed: {
    id: 'architect.protocolReview.dialog.changed',
    defaultMessage:
      'This fix can no longer be made for you, because that part of the protocol changed after the review. Make the change yourself, or review again to get a new fix.',
    description:
      'Notice on a problem whose suggested fix no longer fits the protocol, because the researcher has since changed what it would edit.',
  },
  cannotFix: {
    id: 'architect.protocolReview.dialog.cannotFix',
    defaultMessage:
      'This fix cannot be made for you. Make the change yourself, using the description below.',
    description:
      'Notice on a problem whose suggested fix Architect cannot apply automatically.',
  },
  notOwned: {
    id: 'architect.protocolReview.dialog.notOwned',
    defaultMessage:
      'This protocol is open for editing in another tab, so it cannot be changed here. Make the change in that tab.',
    description:
      'Notice when Fix for me was refused because another browser tab holds this protocol for editing.',
  },
  notUpdated: {
    id: 'architect.protocolReview.dialog.notUpdated',
    defaultMessage:
      'That choice could not be saved, because the review changed in the meantime. Close this and open the problem again.',
    description:
      'Notice when a choice about a problem could not be recorded because the review it belongs to was replaced or the problem was already fixed.',
  },
  fixedState: {
    id: 'architect.protocolReview.dialog.fixedState',
    defaultMessage:
      'This was fixed for you. Undo takes the change back out of your protocol.',
    description:
      'Notice on a problem the researcher already chose Fix for me for, while that change is still in the protocol. "Undo" is the name of a button.',
  },
  fixedNoUndo: {
    id: 'architect.protocolReview.dialog.fixedNoUndo',
    defaultMessage:
      'This was fixed for you. You have changed that part of the protocol since, so the fix cannot be undone from here; use Undo in the toolbar instead.',
    description:
      'Notice on a problem fixed for the researcher whose change can no longer be taken back from the review, only with the app’s ordinary Undo button.',
  },
  mineState: {
    id: 'architect.protocolReview.dialog.mineState',
    defaultMessage: 'You chose to fix this yourself.',
    description:
      'Notice on a problem the researcher already chose "I will fix this" for.',
  },
  dismissedState: {
    id: 'architect.protocolReview.dialog.dismissedState',
    defaultMessage: 'You dismissed this problem.',
    description: 'Notice on a problem the researcher already dismissed.',
  },
  back: {
    id: 'architect.protocolReview.dialog.back',
    defaultMessage: 'Back',
    description: 'Button that goes back to the previous problem in the list.',
  },
  dismiss: {
    id: 'architect.protocolReview.dialog.dismiss',
    defaultMessage: 'Dismiss',
    description:
      'Button that puts a problem found by the automated protocol review away without changing anything, and moves to the next problem.',
  },
  mine: {
    id: 'architect.protocolReview.dialog.mine',
    defaultMessage: 'I will fix this',
    description:
      'Button that keeps a problem on the researcher’s list, for them to fix themselves, and moves to the next problem.',
  },
  fixForMe: {
    id: 'architect.protocolReview.dialog.fixForMe',
    defaultMessage: 'Fix for me',
    description:
      'Button that makes the suggested fix in the protocol now (it can be undone), and moves to the next problem.',
  },
  checkingFix: {
    id: 'architect.protocolReview.dialog.checkingFix',
    defaultMessage: 'Checking whether this fix can be made for you…',
    description:
      'Read by screen readers with the Fix for me button while Architect works out whether the fix leaves a valid protocol.',
  },
  undo: {
    id: 'architect.protocolReview.dialog.undo',
    defaultMessage: 'Undo',
    description:
      'Button that takes a fix made for the researcher back out of the protocol.',
  },
  restore: {
    id: 'architect.protocolReview.dialog.restore',
    defaultMessage: 'Restore',
    description:
      'Button that returns a problem the researcher dismissed, or took on themselves, to the problems still to decide.',
  },
  nextProblem: {
    id: 'architect.protocolReview.dialog.nextProblem',
    defaultMessage: 'Next problem',
    description:
      'Button that moves on from a problem already fixed to the next problem still to decide.',
  },
  captionStage: {
    id: 'architect.protocolReview.dialog.captionStage',
    defaultMessage:
      'Fix for me changes your protocol now, and you can undo it. I will fix this keeps the problem on your list, with a link to stage {position, number}. Each choice takes you to the next problem.',
    description:
      'Caption under the three choices for a problem on one stage. {position} is the stage’s number. "Fix for me" and "I will fix this" are button names and must match their translations.',
  },
  captionCodebook: {
    id: 'architect.protocolReview.dialog.captionCodebook',
    defaultMessage:
      'Fix for me changes your protocol now, and you can undo it. I will fix this keeps the problem on your list, with a link to the codebook. Each choice takes you to the next problem.',
    description:
      'Caption under the three choices for a problem in the codebook. "Fix for me" and "I will fix this" are button names and must match their translations.',
  },
  captionProtocol: {
    id: 'architect.protocolReview.dialog.captionProtocol',
    defaultMessage:
      'Fix for me changes your protocol now, and you can undo it. I will fix this keeps the problem on your list. Each choice takes you to the next problem.',
    description:
      'Caption under the three choices for a problem about the whole protocol. "Fix for me" and "I will fix this" are button names and must match their translations.',
  },
  fixApplied: {
    id: 'architect.protocolReview.dialog.fixApplied',
    defaultMessage: 'Fixed for you: {title}',
    description:
      'Read by screen readers after Fix for me changed the protocol. {title} is the problem’s title, written by the review service.',
  },
  fixUndone: {
    id: 'architect.protocolReview.dialog.fixUndone',
    defaultMessage: 'Fix undone: {title}',
    description:
      'Read by screen readers after a fix made for the researcher was taken back out. {title} is the problem’s title, written by the review service.',
  },
  summaryTitle: {
    id: 'architect.protocolReview.summary.title',
    defaultMessage: 'You have been through every problem',
    description:
      'Heading shown when the researcher has decided about every problem the automated protocol review found.',
  },
  summaryDescription: {
    id: 'architect.protocolReview.summary.description',
    defaultMessage:
      'Here is what you decided. You can change any of it from the Review protocol button.',
    description:
      'Text under the summary heading. "Review protocol" is the name of the toolbar button and must match its translation.',
  },
  summaryFixed: {
    id: 'architect.protocolReview.summary.fixed',
    defaultMessage:
      '{count, plural, one {<num>#</num> fixed for you} other {<num>#</num> fixed for you}}',
    description:
      'One of three counts in the review summary: problems fixed for the researcher. <num></num> marks the number, shown large; keep it around the number.',
  },
  summaryMine: {
    id: 'architect.protocolReview.summary.mine',
    defaultMessage:
      '{count, plural, one {<num>#</num> for you to fix} other {<num>#</num> for you to fix}}',
    description:
      'One of three counts in the review summary: problems the researcher will fix themselves. <num></num> marks the number, shown large; keep it around the number.',
  },
  summaryDismissed: {
    id: 'architect.protocolReview.summary.dismissed',
    defaultMessage:
      '{count, plural, one {<num>#</num> dismissed} other {<num>#</num> dismissed}}',
    description:
      'One of three counts in the review summary: problems the researcher dismissed. <num></num> marks the number, shown large; keep it around the number.',
  },
  forYouToFix: {
    id: 'architect.protocolReview.summary.forYouToFix',
    defaultMessage: 'For you to fix',
    description:
      'Heading of the list of problems the researcher chose to fix themselves.',
  },
  undoNote: {
    id: 'architect.protocolReview.summary.undoNote',
    defaultMessage:
      '{count, plural, one {The fix made for you can be undone} other {The # fixes made for you can each be undone}} from the Review protocol button.',
    description:
      'Note in the review summary, shown when at least one fix was made for the researcher. "Review protocol" is the name of the toolbar button.',
  },
  reviewAgainNote: {
    id: 'architect.protocolReview.summary.reviewAgainNote',
    defaultMessage:
      'When you have made your own changes, review again to check them.',
    description: 'Closing note of the review summary.',
  },
  reviewAgain: {
    id: 'architect.protocolReview.summary.reviewAgain',
    defaultMessage: 'Review again',
    description:
      'Button that starts a new automated review of the protocol as it is now.',
  },
  done: {
    id: 'architect.protocolReview.summary.done',
    defaultMessage: 'Done',
    description: 'Button that closes the review summary.',
  },
  meta: {
    id: 'architect.protocolReview.summary.meta',
    defaultMessage: '{severity} · {location}',
    description:
      'A problem’s severity and where it is, under its title. {severity} is a word such as "Serious"; {location} is a place such as "Stage 5 · Friends". The dot is a separator.',
  },
});

export type ReviewDialogView =
  | { kind: 'finding'; findingId: string }
  | { kind: 'summary' };

/** The next problem still to decide after `fromIndex`, wrapping round. */
const nextUndecided = (
  findings: readonly ReviewFindingView[],
  fromIndex: number,
  excludeId?: string,
): ReviewFindingView | null => {
  for (let step = 1; step <= findings.length; step += 1) {
    const candidate = findings[(fromIndex + step) % findings.length];
    if (candidate?.status === 'undecided' && candidate.id !== excludeId) {
      return candidate;
    }
  }
  return null;
};

type ReviewDialogProps = {
  view: ReviewDialogView | null;
  onViewChange: (view: ReviewDialogView | null) => void;
  /** Starts a new review; the dialog closes first. */
  onReviewAgain: () => void;
  /** Whether a new review can start now, and why not. */
  reviewAgain: Pick<ReviewAvailability, 'canStart' | 'reason'>;
  announce: (message: string) => void;
  /** Where focus returns when the dialog closes. */
  finalFocus: () => HTMLElement | null;
};

const summaryNumber = (chunks: ReactNode[]) => (
  <span className="font-heading block text-4xl font-black">{chunks}</span>
);

type Refusal = { findingId: string; reason: DecisionRefusal };

const refusalMessages: Record<DecisionRefusal, MessageDescriptor> = {
  not_owned: messages.notOwned,
  changed: messages.changed,
  invalid: messages.cannotFix,
  fixed: messages.notUpdated,
  not_fixed: messages.notUpdated,
  no_review: messages.notUpdated,
  not_found: messages.notUpdated,
};

/**
 * One problem at a time, over the page, then a summary once every problem is
 * decided. Each choice moves on to the next problem still to decide.
 */
const ReviewDialog = ({
  view,
  onViewChange,
  onReviewAgain,
  reviewAgain,
  announce,
  finalFocus,
}: ReviewDialogProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const languageName = useLanguageName();
  const findings = useAppSelector(getProtocolReviewFindings);
  const counts = useAppSelector(getProtocolReviewCounts);
  const protocol = useAppSelector(getProtocol);
  const captionId = useId();
  const checkingId = useId();
  const reviewAgainReasonId = useId();

  // What is on screen stays while the dialog animates out.
  const [shown, setShown] = useState(view);
  if (view !== null && view !== shown) setShown(view);
  const open = view !== null;

  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  // Whether each fix can still be made, for the protocol as it stands.
  useEffect(() => {
    if (open && protocol) void dispatch(checkFixAvailability());
  }, [dispatch, open, protocol]);

  const close = () => onViewChange(null);

  const index =
    shown?.kind === 'finding'
      ? findings.findIndex((finding) => finding.id === shown.findingId)
      : -1;
  const finding = index === -1 ? null : findings[index];

  const moveOnFrom = (fromIndex: number, excludeId: string) => {
    const latest = getProtocolReviewFindings(store.getState());
    const next = nextUndecided(latest, fromIndex, excludeId);
    onViewChange(
      next ? { kind: 'finding', findingId: next.id } : { kind: 'summary' },
    );
  };

  const decide = async (
    current: ReviewFindingView,
    decision: FindingDecision,
  ) => {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await dispatch(decideFinding(current.id, decision));
    setBusy(false);
    if (!result.ok) {
      setRefusal({ findingId: current.id, reason: result.reason });
      return;
    }
    if (decision === 'fix') {
      announce(
        intl.formatMessage(messages.fixApplied, { title: current.title }),
      );
    }
    if (decision === 'undecided') return;
    moveOnFrom(index, current.id);
  };

  const undo = async (current: ReviewFindingView) => {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await dispatch(undoFix(current.id));
    setBusy(false);
    if (!result.ok) {
      setRefusal({ findingId: current.id, reason: result.reason });
      return;
    }
    announce(intl.formatMessage(messages.fixUndone, { title: current.title }));
  };

  const placeLink = (target: ReviewFindingView, className?: string) => {
    const link = formatLocationLink(intl, target.location);
    return link ? (
      <ProtocolPlaceLink
        href={link.href}
        onFollow={close}
        className={className}
      >
        {link.label}
      </ProtocolPlaceLink>
    ) : null;
  };

  const renderFinding = (current: ReviewFindingView) => {
    const shownRefusal =
      refusal?.findingId === current.id ? refusal.reason : null;
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
      ...(shownRefusal ? [refusalMessages[shownRefusal]] : []),
      ...(availabilityNotice ? [availabilityNotice] : []),
    ].filter((notice, position, all) => all.indexOf(notice) === position);
    const stateNotice =
      status === 'fixed'
        ? current.canUndo
          ? messages.fixedState
          : messages.fixedNoUndo
        : status === 'mine'
          ? messages.mineState
          : status === 'dismissed'
            ? messages.dismissedState
            : null;
    const location = formatLocation(intl, current.location);
    const link = formatLocationLink(intl, current.location);
    const caption =
      current.location.kind === 'stage'
        ? intl.formatMessage(messages.captionStage, {
            position: current.location.position,
          })
        : current.location.kind === 'codebook'
          ? intl.formatMessage(messages.captionCodebook)
          : intl.formatMessage(messages.captionProtocol);
    const fixPrimary = current.canFix || availability === 'checking';

    const fixButton =
      undecidedOrMine || status === 'dismissed' ? (
        <GuardedButton
          key="fix"
          color={fixPrimary ? 'primary' : 'default'}
          unavailable={busy || availability !== 'available'}
          aria-describedby={
            availability === 'checking' ? checkingId : captionId
          }
          icon={
            availability === 'checking' ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden />
            ) : undefined
          }
          onClick={() => void decide(current, 'fix')}
        >
          {intl.formatMessage(messages.fixForMe)}
        </GuardedButton>
      ) : null;

    return {
      title: current.title,
      header: (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <SeverityLabel severity={current.severity}>
            {intl.formatMessage(severityMessage(current.severity))}
          </SeverityLabel>
          <span className="font-bold">
            {intl.formatMessage(categoryMessage(current.category))}
          </span>
          {link ? (
            <ProtocolPlaceLink href={link.href} onFollow={close}>
              {location}
            </ProtocolPlaceLink>
          ) : (
            <span>{location}</span>
          )}
        </div>
      ),
      body: (
        <div className="flex flex-col gap-4">
          <Paragraph margin="none">{current.explanation}</Paragraph>
          {stateNotice && (
            <Alert variant="info" density="compact" className="my-0">
              <AlertDescription>
                {intl.formatMessage(stateNotice)}
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
              <AlertDescription>{intl.formatMessage(notice)}</AlertDescription>
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
            <Paragraph margin="none">{current.fixSummary}</Paragraph>
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
              <div key={edit.path} className="flex flex-col gap-2">
                <div className="grid gap-3 @min-[36rem]:grid-cols-2">
                  {edit.now !== null && (
                    <div className="bg-surface border-outline flex flex-col gap-1 rounded border p-3">
                      <span className="text-sm font-bold">
                        {intl.formatMessage(messages.now)}
                      </span>
                      <span className="wrap-break-word whitespace-pre-wrap">
                        {edit.now}
                      </span>
                    </div>
                  )}
                  <div className="bg-surface border-primary flex flex-col gap-1 rounded border-2 p-3">
                    <span className="text-sm font-bold">
                      {intl.formatMessage(messages.afterFix)}
                    </span>
                    <span className="wrap-break-word whitespace-pre-wrap">
                      {edit.after}
                    </span>
                  </div>
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
      ),
      footer: (
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-widest uppercase">
              {intl.formatMessage(messages.problemOf, {
                position: index + 1,
                total: findings.length,
              })}
            </span>
            <span aria-hidden className="w-auto">
              <Pips small count={findings.length} currentIndex={index} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {index > 0 && (
              <Button
                onClick={() => {
                  const previous = findings[index - 1];
                  if (previous) {
                    onViewChange({ kind: 'finding', findingId: previous.id });
                  }
                }}
              >
                {intl.formatMessage(messages.back)}
              </Button>
            )}
            <span className="flex-1" />
            {status === 'fixed' ? (
              <>
                {current.canUndo && (
                  <GuardedButton
                    unavailable={busy}
                    onClick={() => void undo(current)}
                  >
                    {intl.formatMessage(messages.undo)}
                  </GuardedButton>
                )}
                <Button
                  color="primary"
                  onClick={() => moveOnFrom(index, current.id)}
                >
                  {intl.formatMessage(messages.nextProblem)}
                </Button>
              </>
            ) : (
              <>
                {current.canRestore && (
                  <GuardedButton
                    variant="text"
                    unavailable={busy}
                    onClick={() => void decide(current, 'undecided')}
                  >
                    {intl.formatMessage(messages.restore)}
                  </GuardedButton>
                )}
                {status !== 'dismissed' && (
                  <GuardedButton
                    variant="text"
                    unavailable={busy}
                    aria-describedby={captionId}
                    onClick={() => void decide(current, 'dismissed')}
                  >
                    {intl.formatMessage(messages.dismiss)}
                  </GuardedButton>
                )}
                {status !== 'mine' && (
                  <GuardedButton
                    color={fixPrimary ? 'default' : 'primary'}
                    unavailable={busy}
                    aria-describedby={captionId}
                    onClick={() => void decide(current, 'mine')}
                  >
                    {intl.formatMessage(messages.mine)}
                  </GuardedButton>
                )}
                {fixButton}
              </>
            )}
          </div>
          {status !== 'fixed' && (
            <Paragraph
              id={captionId}
              intent="smallText"
              emphasis="muted"
              margin="none"
            >
              {caption}
            </Paragraph>
          )}
        </div>
      ),
    };
  };

  const renderSummary = () => {
    const mine = findings.filter((candidate) => candidate.status === 'mine');
    return {
      title: intl.formatMessage(messages.summaryTitle),
      header: null,
      body: (
        <div className="flex flex-col gap-6">
          <Paragraph margin="none">
            {intl.formatMessage(messages.summaryDescription)}
          </Paragraph>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @min-[30rem]:grid-cols-3">
            {(
              [
                [messages.summaryFixed, counts.fixed],
                [messages.summaryMine, counts.mine],
                [messages.summaryDismissed, counts.dismissed],
              ] as const
            ).map(([message, value]) => (
              <li
                key={message.id}
                className="bg-surface-1 flex flex-col rounded p-4 text-sm"
              >
                {intl.formatMessage(message, {
                  count: value,
                  num: summaryNumber,
                })}
              </li>
            ))}
          </ul>
          {mine.length > 0 && (
            <section className="flex flex-col gap-2">
              <Heading level="h3" margin="none" className="text-lg">
                {intl.formatMessage(messages.forYouToFix)}
              </Heading>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {mine.map((item) => (
                  <li
                    key={item.id}
                    className="border-outline flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t pt-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold wrap-break-word">
                        {item.title}
                      </span>
                      <span className="text-sm text-current/70">
                        {intl.formatMessage(messages.meta, {
                          severity: intl.formatMessage(
                            severityMessage(item.severity),
                          ),
                          location: formatLocation(intl, item.location),
                        })}
                      </span>
                    </span>
                    {placeLink(item, 'text-sm')}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-col gap-1 text-sm">
            {counts.fixed > 0 && (
              <Paragraph intent="smallText" margin="none">
                {intl.formatMessage(messages.undoNote, { count: counts.fixed })}
              </Paragraph>
            )}
            <Paragraph intent="smallText" margin="none">
              {intl.formatMessage(messages.reviewAgainNote)}
            </Paragraph>
          </div>
        </div>
      ),
      footer: (
        <div className="flex w-full min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <GuardedButton
              unavailable={!reviewAgain.canStart}
              aria-describedby={
                reviewAgain.reason === null ? undefined : reviewAgainReasonId
              }
              onClick={() => {
                onViewChange(null);
                onReviewAgain();
              }}
            >
              {intl.formatMessage(messages.reviewAgain)}
            </GuardedButton>
            <Button color="primary" onClick={close}>
              {intl.formatMessage(messages.done)}
            </Button>
          </div>
          {reviewAgain.reason !== null && (
            <Paragraph
              id={reviewAgainReasonId}
              intent="smallText"
              emphasis="muted"
              margin="none"
              className="text-end"
            >
              {reviewAgain.reason}
            </Paragraph>
          )}
        </div>
      ),
    };
  };

  const parts =
    finding !== null && finding !== undefined
      ? renderFinding(finding)
      : shown !== null
        ? renderSummary()
        : null;

  return (
    <Dialog
      open={open}
      closeDialog={close}
      onExitComplete={() => setShown(null)}
      finalFocus={finalFocus}
      title={parts?.title}
      header={parts?.header}
      footer={parts?.footer}
      size="readable"
    >
      {parts?.body}
    </Dialog>
  );
};

export default ReviewDialog;
