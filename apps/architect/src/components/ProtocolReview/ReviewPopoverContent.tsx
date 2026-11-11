import { ArrowRight, CircleCheck, PenLine, RefreshCw, X } from 'lucide-react';
import { type ReactNode, useEffect, useId } from 'react';

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
import type { ReviewErrorCode } from '@codaco/protocol-review-worker/contract';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  cancelReview,
  checkFixAvailability,
  decideFinding,
  dismissReviewFailure,
  getProtocolReviewCounts,
  getProtocolReviewFindings,
  getProtocolReviewProgress,
  getProtocolReviewRun,
  getProtocolReviewSummary,
  type ReviewFindingView,
  type ReviewRun,
  undoFix,
} from '~/ducks/modules/protocolReview';
import { getProtocol } from '~/selectors/protocol';

import { GuardedButton, ProtocolPlaceLink } from './reviewControls';
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
      'Your protocol and study details will be sent to the review service, which lists the problems it finds, most serious first; nothing in your protocol changes until you choose.',
    description:
      'What happens when the researcher starts the first automated review of a protocol.',
  },
  startReview: {
    id: 'architect.protocolReview.popover.startReview',
    defaultMessage: 'Start review',
    description: 'Button that starts the first automated review of a protocol.',
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
      'This can take a few minutes. You can close this panel and keep working. The button shows how far the review has got, then a count of the problems found.',
    description:
      'Text while an automated review runs. "The button" is the Review protocol toolbar button.',
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
  reviewed: {
    id: 'architect.protocolReview.popover.reviewed',
    defaultMessage:
      'Reviewed {when} · {total, plural, one {# problem} other {# problems}}, {undecided, plural, =0 {none still to decide} other {# still to decide}}',
    description:
      'Line under the Protocol review heading once a review has finished. {when} is a moment such as "today at 14:32"; {total} is how many problems were found; {undecided} how many the researcher has not decided about yet. The dot is a separator.',
  },
  lastReviewed: {
    id: 'architect.protocolReview.popover.lastReviewed',
    defaultMessage:
      'Last reviewed {when} · {total, plural, one {# problem} other {# problems}}, {undecided, plural, =0 {none still to decide} other {# still to decide}}',
    description:
      'Line under the Protocol review heading when the latest attempt to review did not finish, and the results shown are from an earlier review. {when} is a moment such as "today at 14:32"; {total} is how many problems were found; {undecided} how many the researcher has not decided about yet. The dot is a separator.',
  },
  reviewedNone: {
    id: 'architect.protocolReview.popover.reviewedNone',
    defaultMessage: 'Reviewed {when} · no problems',
    description:
      'Line under the Protocol review heading once a review found nothing. {when} is a moment such as "today at 14:32". The dot is a separator.',
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
  restore: {
    id: 'architect.protocolReview.popover.restore',
    defaultMessage: 'Restore',
    description:
      'Button beside a dismissed problem, or one the researcher took on, that returns it to the problems still to decide.',
  },
  goThrough: {
    id: 'architect.protocolReview.popover.goThrough',
    defaultMessage:
      'Go through {count, plural, one {# problem} other {# problems}}',
    description:
      'Button that opens the problems still to decide one at a time. {count} is how many there are.',
  },
  reviewAgain: {
    id: 'architect.protocolReview.popover.reviewAgain',
    defaultMessage: 'Review again',
    description:
      'Button that starts a new automated review of the protocol as it is now.',
  },
  tryAgain: {
    id: 'architect.protocolReview.popover.tryAgain',
    defaultMessage: 'Try again',
    description:
      'Button that starts the review again after the review service was not available.',
  },
  quota: {
    id: 'architect.protocolReview.popover.quota',
    defaultMessage:
      '{remaining, number} of {limit, number} reviews left this hour',
    description:
      'Caption beside the review buttons: how many reviews the researcher may still start this hour.',
  },
  editStudyDetails: {
    id: 'architect.protocolReview.popover.editStudyDetails',
    defaultMessage: 'Edit study details',
    description:
      'Button that opens the study details dialog (research questions, participants, synopsis, sharing) to change them.',
  },
  offlineTitle: {
    id: 'architect.protocolReview.notice.offlineTitle',
    defaultMessage: 'You’re offline',
    description:
      'Title of the notice shown when there is no internet connection.',
  },
  offlineBody: {
    id: 'architect.protocolReview.notice.offlineBody',
    defaultMessage:
      'Protocol review needs an internet connection. Your last review is still here, and you can keep working through it.',
    description:
      'Text of the offline notice when this protocol has an earlier review, which stays on screen below the notice.',
  },
  offlineBodyNoReview: {
    id: 'architect.protocolReview.notice.offlineBodyNoReview',
    defaultMessage:
      'Protocol review needs an internet connection. You can review this protocol when you are back online.',
    description:
      'Text of the offline notice when this protocol has not been reviewed yet.',
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
  dailyTitle: {
    id: 'architect.protocolReview.notice.dailyTitle',
    defaultMessage: 'Protocol review has reached its limit for today',
    description:
      'Title of the notice shown when the service’s shared daily budget is spent.',
  },
  dailyBodyWithTime: {
    id: 'architect.protocolReview.notice.dailyBodyWithTime',
    defaultMessage:
      'This is a free experimental service with a fixed daily budget shared by everyone who uses it, and today’s has been spent. It starts again {when}. Nothing in your protocol was changed.',
    description:
      'Text of the daily limit notice when the service said when it restarts. {when} is a moment such as "tomorrow at 01:00".',
  },
  dailyBody: {
    id: 'architect.protocolReview.notice.dailyBody',
    defaultMessage:
      'This is a free experimental service with a fixed daily budget shared by everyone who uses it, and today’s has been spent. Nothing in your protocol was changed.',
    description:
      'Text of the daily limit notice when the service did not say when it restarts.',
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

type NoticeKind = 'offline' | 'hourly' | 'daily' | 'unavailable' | 'too_large';

const failureNotices: Record<ReviewErrorCode, NoticeKind> = {
  hourly_limit: 'hourly',
  daily_limit: 'daily',
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
): NoticeKind | null => {
  if (!online) return 'offline';
  if (run.status === 'failed') return failureNotices[run.code];
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
  onOpenFinding: (findingId: string) => void;
  onStartReview: () => void;
  onEditStudyDetails: () => void;
  announce: (message: string) => void;
};

/**
 * What the Review protocol popover shows, by the state of the review: ready
 * for a first review, running, or its results; with any notice about a review
 * that could not run above whatever results there are.
 */
const ReviewPopoverContent = ({
  onClose,
  onOpenFinding,
  onStartReview,
  onEditStudyDetails,
  announce,
}: ReviewPopoverContentProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const run = useAppSelector(getProtocolReviewRun);
  const summary = useAppSelector(getProtocolReviewSummary);
  const findings = useAppSelector(getProtocolReviewFindings);
  const counts = useAppSelector(getProtocolReviewCounts);
  const progress = useAppSelector(getProtocolReviewProgress);
  const protocol = useAppSelector(getProtocol);
  const {
    now,
    online,
    limit,
    remaining,
    retryAt,
    hourlyResetsAt,
    canStart,
    reason: blockedReason,
  } = useReviewAvailability();
  const captionId = useId();

  // Whether each fix can still be made, for the protocol as it stands.
  useEffect(() => {
    if (protocol && summary) void dispatch(checkFixAvailability());
  }, [dispatch, protocol, summary]);

  const notice = noticeOf(online, run, hourlyResetsAt !== null);
  const running = run.status === 'running';

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
    const when = formatWhen(intl, summary.createdAt, now);
    if (counts.total === 0) {
      return intl.formatMessage(messages.reviewedNone, { when });
    }
    return intl.formatMessage(
      notice === null ? messages.reviewed : messages.lastReviewed,
      { when, total: counts.total, undecided: counts.undecided },
    );
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
          body: intl.formatMessage(
            summary ? messages.offlineBody : messages.offlineBodyNoReview,
          ),
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
        daily: {
          title: intl.formatMessage(messages.dailyTitle),
          body:
            retryAt === null
              ? intl.formatMessage(messages.dailyBody)
              : intl.formatMessage(messages.dailyBodyWithTime, {
                  when: formatWhen(intl, retryAt, now),
                }),
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
      <li key={finding.id} className="border-outline border-t">
        <button
          type="button"
          onClick={() => onOpenFinding(finding.id)}
          className="focusable hover:bg-surface-1 flex w-full items-start gap-3 px-6 py-3 text-start"
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
                {intl.formatMessage(messages.restore)}
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
  const startLabel =
    run.status === 'failed' && failureNotices[run.code] === 'unavailable'
      ? messages.tryAgain
      : summary
        ? messages.reviewAgain
        : messages.startReview;

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

  return (
    <div className="flex max-h-[min(54rem,var(--available-height,100dvh))] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[inherit]">
      <div className="flex items-start gap-4 px-6 pt-6 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <PopoverTitle
            render={<Heading level="h2" margin="none" className="text-xl" />}
          >
            {intl.formatMessage(messages.title)}
          </PopoverTitle>
          <span className="text-sm text-current/70">{subline}</span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {renderNotice()}
      {body}
      <div className="border-outline flex flex-col gap-3 border-t px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button onClick={() => dispatch(cancelReview())}>
              {intl.formatMessage(messages.cancelReview)}
            </Button>
          ) : (
            <>
              {summary && counts.undecided > 0 && firstUndecided && (
                <Button
                  color="primary"
                  icon={<ArrowRight className="rtl:rotate-180" aria-hidden />}
                  iconPosition="right"
                  onClick={() => onOpenFinding(firstUndecided.id)}
                >
                  {intl.formatMessage(messages.goThrough, {
                    count: counts.undecided,
                  })}
                </Button>
              )}
              <GuardedButton
                color={summary && counts.undecided > 0 ? 'default' : 'primary'}
                icon={summary ? <RefreshCw aria-hidden /> : undefined}
                unavailable={!canStart}
                aria-describedby={blockedReason ? captionId : undefined}
                onClick={onStartReview}
              >
                {intl.formatMessage(startLabel)}
              </GuardedButton>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span id={captionId} className="text-current/70">
            {caption}
          </span>
          {!running && (
            <Button size="sm" variant="link" onClick={onEditStudyDetails}>
              {intl.formatMessage(messages.editStudyDetails)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewPopoverContent;
