import { ArrowRight, CircleCheck, PenLine, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { PopoverTitle } from '@codaco/fresco-ui/Popover';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  REVIEW_PROVIDER_NAMES,
  type ReviewErrorCode,
} from '@codaco/protocol-review-worker/contract';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  cancelReview,
  decideFinding,
  dismissReview,
  dismissReviewFailure,
  getProtocolReviewCounts,
  getProtocolReviewFindings,
  getProtocolReviewPhase,
  getProtocolReviewProgress,
  getProtocolReviewRun,
  getProtocolReviewSummary,
  refreshReviewProviders,
  type ReviewFindingView,
  type ReviewRun,
  undoFix,
} from '~/ducks/modules/protocolReview';
import { getProtocol } from '~/selectors/protocol';

import { GuardedButton, ProtocolPlaceLink } from './reviewControls';
import ReviewProblemView from './ReviewProblemView';
import {
  formatLocation,
  formatLocationLink,
  formatWhen,
  severityMessage,
  SeverityIcon,
} from './reviewText';
import { useReviewAvailability } from './useReviewAvailability';

const messages = defineMessages({
  title: {
    id: 'architect.protocolReview.popover.title',
    defaultMessage: 'Protocol review',
    description:
      'Heading of the panel that opens from the Review protocol toolbar button, showing the automated protocol review.',
  },
  notReviewed: {
    id: 'architect.protocolReview.popover.notReviewed',
    defaultMessage: 'Not reviewed yet',
    description:
      'Line under the Protocol review heading before the protocol has ever been reviewed.',
  },
  ready: {
    id: 'architect.protocolReview.popover.ready',
    defaultMessage:
      'A review lists the problems it finds in your protocol, most serious first. Nothing in your protocol changes until you choose.',
    description:
      'Shown in the review panel while the protocol has no review: what a review gives the researcher.',
  },
  startReview: {
    id: 'architect.protocolReview.popover.startReview',
    defaultMessage: 'Start review',
    description:
      'Button in the review panel that opens the dialog a researcher goes through to start an automated review of the protocol.',
  },
  started: {
    id: 'architect.protocolReview.popover.started',
    defaultMessage: 'Started at {time}',
    description:
      'Line under the Protocol review heading while a review runs. {time} is a time of day, already formatted.',
  },
  runningHeading: {
    id: 'architect.protocolReview.popover.runningHeading',
    defaultMessage:
      'Reviewing {count, plural, one {# stage} other {# stages}} against your study details',
    description:
      'Heading while an automated review runs. {count} is how many stages the protocol has.',
  },
  runningBody: {
    id: 'architect.protocolReview.popover.runningBody',
    defaultMessage:
      'This can take a few minutes. You can close this panel and keep working. While the panel is closed, the button shows how far the review has got, then a count of the problems found.',
    description:
      'Text while an automated review runs. "The button" is the Review protocol toolbar button.',
  },
  phaseThinking: {
    id: 'architect.protocolReview.popover.phaseThinking',
    defaultMessage:
      'The reviewer is reading your protocol and thinking it through.',
    description:
      'Line under the progress bar during the first part of an automated review, before the reviewer (an AI model) has begun writing its answer.',
  },
  phaseWriting: {
    id: 'architect.protocolReview.popover.phaseWriting',
    defaultMessage: 'The reviewer is writing up what it found.',
    description:
      'Line under the progress bar during the second part of an automated review, while the reviewer (an AI model) writes its answer.',
  },
  progress: {
    id: 'architect.protocolReview.popover.progress',
    defaultMessage: 'Review progress',
    description:
      'Accessible name, read by screen readers, of the progress bar shown while an automated review runs.',
  },
  cancelReview: {
    id: 'architect.protocolReview.popover.cancelReview',
    defaultMessage: 'Cancel review',
    description:
      'Button that stops the review in progress. Nothing is saved and it does not count towards the hourly limit.',
  },
  runningCaption: {
    id: 'architect.protocolReview.popover.runningCaption',
    defaultMessage: 'Review {current, number} of {limit, number} this hour',
    description:
      'Caption while a review runs: which of the researcher’s reviews allowed this hour it is.',
  },
  resultsIntro: {
    id: 'architect.protocolReview.popover.resultsIntro',
    defaultMessage:
      'The results of your review are shown below in order of importance.',
    description:
      'Line under the Protocol review heading, above the list of problems the review found.',
  },
  noProblems: {
    id: 'architect.protocolReview.popover.noProblems',
    defaultMessage: 'The review found no problems.',
    description: 'Shown in place of the list when a review found nothing.',
  },
  problemsFound: {
    id: 'architect.protocolReview.popover.problemsFound',
    defaultMessage: 'Problems found',
    description:
      'Accessible name, read by screen readers, of the list of problems the review found.',
  },
  meta: {
    id: 'architect.protocolReview.popover.meta',
    defaultMessage: '{severity} · {location}',
    description:
      'A problem’s severity and where it is, under its title in the list. {severity} is a word such as "Serious"; {location} is a place such as "Stage 10 · Who knows whom". The dot is a separator.',
  },
  fixed: {
    id: 'architect.protocolReview.popover.fixed',
    defaultMessage: 'Fixed for you',
    description:
      'Status of a problem whose suggested fix was made in the protocol by Architect.',
  },
  mine: {
    id: 'architect.protocolReview.popover.mine',
    defaultMessage: 'For you to fix',
    description:
      'Status of a problem the researcher chose to fix themselves ("I will fix this").',
  },
  dismissed: {
    id: 'architect.protocolReview.popover.dismissed',
    defaultMessage: 'Dismissed',
    description: 'Status of a problem the researcher dismissed.',
  },
  undo: {
    id: 'architect.protocolReview.popover.undo',
    defaultMessage: 'Undo',
    description:
      'Button beside "Fixed for you" that takes the fix back out of the protocol.',
  },
  fixUndone: {
    id: 'architect.protocolReview.popover.fixUndone',
    defaultMessage: 'Fix undone: {title}',
    description:
      'Read by screen readers after Undo in the review list took a fix back out of the protocol. {title} is the problem’s title, written by the review service.',
  },
  undoDismiss: {
    id: 'architect.protocolReview.popover.undoDismiss',
    defaultMessage: 'Undo dismiss',
    description:
      'Button beside a dismissed problem in the review list that returns it to the problems still to decide.',
  },
  goThrough: {
    id: 'architect.protocolReview.popover.goThrough',
    defaultMessage:
      'Go through {count, plural, one {# problem} other {# problems}}',
    description:
      'Button that opens the problems still to decide one at a time. {count} is how many there are.',
  },
  dismissReview: {
    id: 'architect.protocolReview.popover.dismissReview',
    defaultMessage: 'Dismiss review',
    description:
      'Button under the list of problems that removes the review. The protocol is then as if it had not been reviewed, and a new review can be started.',
  },
  reviewDismissed: {
    id: 'architect.protocolReview.popover.reviewDismissed',
    defaultMessage: 'Review dismissed.',
    description:
      'Read by screen readers after Dismiss review removed the review.',
  },
  dismissRefused: {
    id: 'architect.protocolReview.popover.dismissRefused',
    defaultMessage:
      'The review could not be dismissed, because this protocol is open for editing in another tab. Dismiss it in that tab.',
    description:
      'Notice when Dismiss review was refused because another browser tab holds this protocol for editing.',
  },
  tryAgain: {
    id: 'architect.protocolReview.popover.tryAgain',
    defaultMessage: 'Try again',
    description:
      'Button that sends the same review again after the review service was not available.',
  },
  quota: {
    id: 'architect.protocolReview.popover.quota',
    defaultMessage:
      '{remaining, number} of {limit, number} reviews left this hour',
    description:
      'Caption beside the review buttons: how many reviews the researcher may still start this hour.',
  },
  offlineTitle: {
    id: 'architect.protocolReview.notice.offlineTitle',
    defaultMessage: 'You’re offline',
    description:
      'Title of the notice shown when there is no internet connection.',
  },
  offlineBodyNoReview: {
    id: 'architect.protocolReview.notice.offlineBodyNoReview',
    defaultMessage:
      'Protocol review needs an internet connection. You can review this protocol when you are back online.',
    description:
      'Text of the offline notice, shown in the review panel while the protocol has no review.',
  },
  hourlyTitle: {
    id: 'architect.protocolReview.notice.hourlyTitle',
    defaultMessage:
      'You have used your {limit, plural, one {# review} other {# reviews}} for this hour',
    description:
      'Title of the notice shown when the researcher has started as many reviews as are allowed in an hour. {limit} is that number.',
  },
  hourlyBody: {
    id: 'architect.protocolReview.notice.hourlyBody',
    defaultMessage:
      'You can review again {when}. The limit keeps this free service available to everyone.',
    description:
      'Text of the hourly limit notice. {when} is a moment such as "today at 15:32".',
  },
  budgetTitle: {
    id: 'architect.protocolReview.notice.budgetTitle',
    defaultMessage: 'The budget for {company} has been spent',
    description:
      'Title of the notice shown when a review could not start because the budget of the provider chosen to write it is spent. {company} is the provider’s name, "Anthropic" or "OpenAI", and is not translated.',
  },
  budgetBody: {
    id: 'architect.protocolReview.notice.budgetBody',
    defaultMessage:
      'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. Start the review again to choose another model. Nothing in your protocol was changed.',
    description:
      'Text of the notice shown when the chosen provider’s budget is spent and another provider still has budget. A provider is the company whose AI model writes the review (Anthropic or OpenAI); the researcher chooses a model in the last step of the dialog that starts a review.',
  },
  allSpentTitle: {
    id: 'architect.protocolReview.notice.allSpentTitle',
    defaultMessage: 'Protocol review has reached its limit',
    description:
      'Title of the notice shown when the budget of every provider is spent, so no review can start for now.',
  },
  allSpentBody: {
    id: 'architect.protocolReview.notice.allSpentBody',
    defaultMessage:
      'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. Every provider’s budget has been spent.',
    description:
      'Text of the notice shown when the budget of every provider is spent. A provider is the company whose AI model writes the review (Anthropic or OpenAI).',
  },
  unavailableTitle: {
    id: 'architect.protocolReview.notice.unavailableTitle',
    defaultMessage: 'Protocol review is not available right now',
    description:
      'Title of the notice shown when the review service failed or refused the request.',
  },
  unavailableBody: {
    id: 'architect.protocolReview.notice.unavailableBody',
    defaultMessage:
      'The problem is with the review service, not with your protocol or your connection, and the Network Canvas team has been told. Nothing in your protocol was changed, and this attempt did not count towards your limit.',
    description:
      'Text of the service unavailable notice. "Network Canvas" is a product name and is not translated.',
  },
  tooLargeTitle: {
    id: 'architect.protocolReview.notice.tooLargeTitle',
    defaultMessage: 'This protocol is too large to review',
    description:
      'Title of the notice shown when the protocol is larger than the review service accepts.',
  },
  tooLargeBody: {
    id: 'architect.protocolReview.notice.tooLargeBody',
    defaultMessage:
      'The review service only accepts protocols up to a fixed size, and this one is larger. Nothing in your protocol was changed, and this attempt did not count towards your limit.',
    description: 'Text of the too-large notice.',
  },
  dismissNotice: {
    id: 'architect.protocolReview.notice.dismiss',
    defaultMessage: 'Dismiss',
    description:
      'Button that hides the notice about a review that could not be completed.',
  },
});

type NoticeKind =
  | 'offline'
  | 'hourly'
  | 'budget'
  | 'all_spent'
  | 'unavailable'
  | 'too_large';

const failureNotices: Record<ReviewErrorCode, NoticeKind> = {
  hourly_limit: 'hourly',
  // Which of a provider's budgets is spent changes only when it starts
  // again, which the provider's own line in the footer says.
  daily_limit: 'budget',
  monthly_limit: 'budget',
  too_large: 'too_large',
  service_unavailable: 'unavailable',
  // Neither is the researcher's to fix: the service refused a request this
  // app built, which is the service's problem as far as they can tell.
  forbidden_origin: 'unavailable',
  invalid_request: 'unavailable',
};

const noticeOf = (
  online: boolean,
  run: ReviewRun,
  hourlyLimitReached: boolean,
  anyProviderAvailable: boolean,
): NoticeKind | null => {
  if (!online) return 'offline';
  if (run.status === 'failed') {
    const notice = failureNotices[run.code];
    return notice === 'budget' && !anyProviderAvailable ? 'all_spent' : notice;
  }
  if (!anyProviderAvailable) return 'all_spent';
  if (hourlyLimitReached) return 'hourly';
  return null;
};

const statusMessages: Record<
  'fixed' | 'mine' | 'dismissed',
  { message: MessageDescriptor; icon: ReactNode }
> = {
  fixed: { message: messages.fixed, icon: <CircleCheck aria-hidden /> },
  mine: { message: messages.mine, icon: <PenLine aria-hidden /> },
  dismissed: { message: messages.dismissed, icon: <X aria-hidden /> },
};

type ReviewPopoverContentProps = {
  onClose: () => void;
  /** Opens the dialog every review is asked for through. */
  onRequestReview: () => void;
  /** Sends the review that failed again, as it was asked for. */
  onRetryReview: () => void;
  announce: (message: string) => void;
};

/** What the panel shows of a review: all its problems, or one of them. */
type PanelView = { kind: 'list' } | { kind: 'problem'; findingId: string };

/**
 * What the Review protocol popover shows, by the state of the review: none
 * yet, running, or its results; with any notice about a review that could
 * not run above. The results are a list of problems, and opening one shows
 * it in the list's place.
 */
const ReviewPopoverContent = ({
  onClose,
  onRequestReview,
  onRetryReview,
  announce,
}: ReviewPopoverContentProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const run = useAppSelector(getProtocolReviewRun);
  const summary = useAppSelector(getProtocolReviewSummary);
  const findings = useAppSelector(getProtocolReviewFindings);
  const counts = useAppSelector(getProtocolReviewCounts);
  const progress = useAppSelector(getProtocolReviewProgress);
  const phase = useAppSelector(getProtocolReviewPhase);
  const protocol = useAppSelector(getProtocol);
  const {
    now,
    online,
    limit,
    remaining,
    providers,
    provider,
    hourlyResetsAt,
    canRequest,
    reason: blockedReason,
  } = useReviewAvailability();
  const captionId = useId();

  const [view, setView] = useState<PanelView>({ kind: 'list' });
  // Whether the view has changed since the panel opened: the first view
  // arrives with the panel, and only a later one slides in.
  const [switched, setSwitched] = useState(false);
  // The problem last shown, whose row takes focus when the list comes back.
  const returnTo = useRef<string | null>(null);
  const [dismissRefused, setDismissRefused] = useState(false);

  const openFinding = (findingId: string) => {
    setSwitched(true);
    setView({ kind: 'problem', findingId });
  };
  const showList = () => {
    if (view.kind === 'problem') returnTo.current = view.findingId;
    setSwitched(true);
    setView({ kind: 'list' });
  };

  // Which providers have budget left is the service's to say, so it is asked
  // each time this opens, and again when the connection comes back.
  useEffect(() => {
    if (online) void dispatch(refreshReviewProviders());
  }, [dispatch, online]);

  const running = run.status === 'running';
  // A notice is about a review that cannot be asked for or did not finish.
  // With results on screen there is nothing to ask for until they are
  // dismissed, so none is shown.
  const notice =
    summary && !running
      ? null
      : noticeOf(
          online,
          run,
          hourlyResetsAt !== null,
          providers.some((choice) => choice.available),
        );

  const subline = (() => {
    if (running) {
      return intl.formatMessage(messages.started, {
        time: intl.formatTime(run.startedAt, {
          hour: 'numeric',
          minute: '2-digit',
        }),
      });
    }
    if (!summary) return intl.formatMessage(messages.notReviewed);
    return findings.length === 0
      ? null
      : intl.formatMessage(messages.resultsIntro);
  })();

  const renderNotice = () => {
    if (notice === null) return null;
    const dismiss =
      run.status === 'failed' ? (
        <Button
          size="sm"
          variant="text"
          onClick={() => dispatch(dismissReviewFailure())}
        >
          {intl.formatMessage(messages.dismissNotice)}
        </Button>
      ) : null;
    const contents: Record<NoticeKind, { title: string; body: string | null }> =
      {
        offline: {
          title: intl.formatMessage(messages.offlineTitle),
          body: intl.formatMessage(messages.offlineBodyNoReview),
        },
        hourly: {
          title: intl.formatMessage(messages.hourlyTitle, { limit }),
          body:
            hourlyResetsAt === null
              ? null
              : intl.formatMessage(messages.hourlyBody, {
                  when: formatWhen(intl, hourlyResetsAt, now),
                }),
        },
        budget: {
          title: intl.formatMessage(messages.budgetTitle, {
            company:
              REVIEW_PROVIDER_NAMES[
                run.status === 'failed' ? run.provider : provider
              ].company,
          }),
          body: intl.formatMessage(messages.budgetBody),
        },
        all_spent: {
          title: intl.formatMessage(messages.allSpentTitle),
          body: intl.formatMessage(messages.allSpentBody),
        },
        unavailable: {
          title: intl.formatMessage(messages.unavailableTitle),
          body: intl.formatMessage(messages.unavailableBody),
        },
        too_large: {
          title: intl.formatMessage(messages.tooLargeTitle),
          body: intl.formatMessage(messages.tooLargeBody),
        },
      };
    const content = contents[notice];
    return (
      <div className="px-6 pb-4">
        <Alert variant="warning" density="compact" className="my-0">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <AlertTitle>{content.title}</AlertTitle>
            {content.body !== null && (
              <AlertDescription className="text-sm">
                {content.body}
              </AlertDescription>
            )}
            {dismiss && <div className="flex justify-end">{dismiss}</div>}
          </div>
        </Alert>
      </div>
    );
  };

  const renderRow = (finding: ReviewFindingView) => {
    const status = finding.status === 'undecided' ? null : finding.status;
    const link =
      finding.status === 'mine'
        ? formatLocationLink(intl, finding.location)
        : null;
    return (
      <li
        key={finding.id}
        className="border-outline has-[>button:hover]:bg-surface-1 border-t"
      >
        <button
          type="button"
          ref={(row) => {
            if (row === null || returnTo.current !== finding.id) return;
            returnTo.current = null;
            row.focus();
          }}
          onClick={() => openFinding(finding.id)}
          className="focusable flex w-full items-start gap-3 px-6 py-3 text-start"
        >
          <SeverityIcon severity={finding.severity} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-heading leading-snug font-bold wrap-break-word">
              {finding.title}
            </span>
            <span className="text-sm text-current/70">
              {intl.formatMessage(messages.meta, {
                severity: intl.formatMessage(severityMessage(finding.severity)),
                location: formatLocation(intl, finding.location),
              })}
            </span>
          </span>
          <ArrowRight
            className="mt-1 size-4 shrink-0 rtl:rotate-180"
            aria-hidden
          />
        </button>
        {status !== null && (
          <div className="flex flex-wrap items-center gap-3 ps-17 pe-6 pb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-current px-2.5 py-0.5 text-xs font-bold [&_svg]:size-3.5">
              {statusMessages[status].icon}
              {intl.formatMessage(statusMessages[status].message)}
            </span>
            {finding.canUndo && (
              <Button
                size="sm"
                variant="link"
                onClick={async () => {
                  const result = await dispatch(undoFix(finding.id));
                  if (result.ok) {
                    announce(
                      intl.formatMessage(messages.fixUndone, {
                        title: finding.title,
                      }),
                    );
                  }
                }}
              >
                {intl.formatMessage(messages.undo)}
              </Button>
            )}
            {link && (
              <ProtocolPlaceLink
                href={link.href}
                onFollow={onClose}
                className="text-sm"
              >
                {link.label}
              </ProtocolPlaceLink>
            )}
            {finding.canRestore && finding.status === 'dismissed' && (
              <Button
                size="sm"
                variant="link"
                onClick={() =>
                  void dispatch(decideFinding(finding.id, 'undecided'))
                }
              >
                {intl.formatMessage(messages.undoDismiss)}
              </Button>
            )}
          </div>
        )}
      </li>
    );
  };

  const firstUndecided = findings.find(
    (finding) => finding.status === 'undecided',
  );
  // A review the service could not answer is sent again as it was asked
  // for. Every other start goes through the dialog.
  const retry =
    run.status === 'failed' && failureNotices[run.code] === 'unavailable';

  const shownIndex =
    view.kind === 'problem' && summary && !running
      ? findings.findIndex((finding) => finding.id === view.findingId)
      : -1;
  const shown = shownIndex === -1 ? undefined : findings[shownIndex];

  const dismiss = async () => {
    const dismissed = await dispatch(dismissReview());
    setDismissRefused(!dismissed);
    if (!dismissed) return;
    announce(intl.formatMessage(messages.reviewDismissed));
    onClose();
  };

  const body = running ? (
    <div className="flex flex-col gap-4 px-6 pb-4">
      <Heading level="h3" margin="none" className="text-lg">
        {intl.formatMessage(messages.runningHeading, {
          count: protocol?.stages.length ?? 0,
        })}
      </Heading>
      <Paragraph margin="none">
        {intl.formatMessage(messages.runningBody)}
      </Paragraph>
      <ProgressBar
        orientation="horizontal"
        tone="info"
        nudge={false}
        label={intl.formatMessage(messages.progress)}
        percentProgress={Math.round((progress ?? 0) * 100)}
      />
      {/* A status, so the change from thinking to writing is read out once. */}
      <Paragraph margin="none" role="status" className="text-sm">
        {intl.formatMessage(
          phase === 'writing' ? messages.phaseWriting : messages.phaseThinking,
        )}
      </Paragraph>
    </div>
  ) : !summary ? (
    <div className="px-6 pb-4">
      <Paragraph margin="none">{intl.formatMessage(messages.ready)}</Paragraph>
    </div>
  ) : findings.length === 0 ? (
    <div className="px-6 pb-4">
      <Paragraph margin="none">
        {intl.formatMessage(messages.noProblems)}
      </Paragraph>
    </div>
  ) : (
    <ScrollArea className="min-h-0 flex-1" fade>
      <ol
        aria-label={intl.formatMessage(messages.problemsFound)}
        className="m-0 list-none p-0"
      >
        {findings.map(renderRow)}
      </ol>
    </ScrollArea>
  );

  const caption = running
    ? intl.formatMessage(messages.runningCaption, {
        current: Math.min(limit, limit - remaining + 1),
        limit,
      })
    : (blockedReason ??
      intl.formatMessage(messages.quota, { remaining, limit }));

  // The panel stays above the button and scrolls inside when it is tall. Its
  // height stops a little short of the room there is: a popup that fills the
  // room exactly is one the positioner moves to another side of the button,
  // which a problem longer than the list before it would otherwise do.
  const frame =
    'flex max-h-[min(54rem,calc(var(--available-height,100dvh)-0.5rem))] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[inherit]';
  // A view that replaces another arrives with a short fade and rise.
  const arriving =
    switched &&
    'spring-short transition-[opacity,translate] motion-reduce:transition-none starting:translate-y-2 starting:opacity-0';

  if (shown) {
    return (
      <div key={shown.id} className={cx(frame, arriving)}>
        <ReviewProblemView
          finding={shown}
          index={shownIndex}
          total={findings.length}
          onOpenFinding={openFinding}
          onBack={showList}
          onClose={onClose}
          announce={announce}
        />
      </div>
    );
  }

  return (
    <div key="list" className={cx(frame, arriving)}>
      <div className="flex items-start gap-4 px-6 pt-6 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <PopoverTitle
            render={<Heading level="h2" margin="none" className="text-xl" />}
          >
            {intl.formatMessage(messages.title)}
          </PopoverTitle>
          {subline !== null && (
            <span className="text-sm text-current/70">{subline}</span>
          )}
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {renderNotice()}
      {dismissRefused && (
        <div className="px-6 pb-4">
          <Alert variant="warning" density="compact" className="my-0">
            <AlertDescription className="text-sm">
              {intl.formatMessage(messages.dismissRefused)}
            </AlertDescription>
          </Alert>
        </div>
      )}
      {body}
      <div className="border-outline flex flex-col gap-3 border-t px-6 py-4">
        {running ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => dispatch(cancelReview())}>
                {intl.formatMessage(messages.cancelReview)}
              </Button>
            </div>
            <span className="text-sm text-current/70">{caption}</span>
          </>
        ) : summary ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={() => void dismiss()}>
              {intl.formatMessage(messages.dismissReview)}
            </Button>
            {counts.undecided > 0 && firstUndecided && (
              <Button
                color="primary"
                icon={<ArrowRight className="rtl:rotate-180" aria-hidden />}
                iconPosition="right"
                onClick={() => openFinding(firstUndecided.id)}
              >
                {intl.formatMessage(messages.goThrough, {
                  count: counts.undecided,
                })}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <GuardedButton
                color="primary"
                unavailable={!canRequest}
                aria-describedby={blockedReason ? captionId : undefined}
                onClick={retry ? onRetryReview : onRequestReview}
              >
                {intl.formatMessage(
                  retry ? messages.tryAgain : messages.startReview,
                )}
              </GuardedButton>
            </div>
            <span id={captionId} className="text-sm text-current/70">
              {caption}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default ReviewPopoverContent;
