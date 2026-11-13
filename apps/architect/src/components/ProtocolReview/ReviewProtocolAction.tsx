import { Loader2 } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import {
  defineToolbarChild,
  ToolbarButton,
  type ToolbarButtonProps,
  ToolbarPopover,
} from '@codaco/fresco-ui/SegmentedToolbar';
import type { ProjectActionsMode } from '~/components/ProjectNav/ProjectActions';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import {
  getIsProtocolReviewRecordRead,
  getProtocolReviewCounts,
  getProtocolReviewProgress,
  getProtocolReviewRun,
  getProtocolReviewSummary,
  refreshReviewProviders,
  startReview,
} from '~/ducks/modules/protocolReview';
import { type ReviewPlace, reviewPlaceAt } from '~/protocolReview/reviewPlace';
import { getIsProtocolReviewEnabled } from '~/selectors/protocol';

import ReviewPopoverContent from './ReviewPopoverContent';
import ReviewProgressRing from './ReviewProgressRing';
import ReviewSparklesIcon from './ReviewSparklesIcon';
import { useStartReviewWizard } from './StartReviewWizard';
import { useReviewAvailability } from './useReviewAvailability';

const messages = defineMessages({
  reviewProtocol: {
    id: 'architect.protocolReview.button.reviewProtocol',
    defaultMessage: 'Review protocol',
    description:
      'Toolbar button on the Stages screen that opens the automated protocol review.',
  },
  reviewing: {
    id: 'architect.protocolReview.button.reviewing',
    defaultMessage: 'Reviewing…',
    description:
      'Label of the Review protocol toolbar button while an automated review runs.',
  },
  undecided: {
    id: 'architect.protocolReview.button.undecided',
    defaultMessage:
      'Review protocol, {count, plural, one {# problem still to decide} other {# problems still to decide}}',
    description:
      'Accessible name, read by screen readers, of the Review protocol toolbar button while it shows a count badge. It must start with the button’s visible text ("Review protocol", as translated for that button). {count} is how many problems from the last review the researcher has not decided about.',
  },
  finished: {
    id: 'architect.protocolReview.button.finished',
    defaultMessage:
      'Protocol review finished. {count, plural, =0 {It found no problems.} one {It found # problem.} other {It found # problems.}}',
    description:
      'Read by screen readers when an automated review finishes. {count} is how many problems it found.',
  },
  failed: {
    id: 'architect.protocolReview.button.failed',
    defaultMessage:
      'Protocol review could not be completed. Open Review protocol to see why.',
    description:
      'Read by screen readers when an automated review fails. "Review protocol" is the name of the toolbar button and must match its translation.',
  },
  notStarted: {
    id: 'architect.protocolReview.button.notStarted',
    defaultMessage: 'The review could not start. Review protocol says why.',
    description:
      'Read by screen readers when a review could not start (offline, the hourly limit, or another reason shown in the panel). "Review protocol" is the name of the toolbar button.',
  },
});

type ReviewProtocolActionProps = {
  ref?: ToolbarButtonProps['ref'];
  /** The screen it is on, other than the Stages screen. */
  place?: ReviewPlace | null;
};

/**
 * The Review protocol toolbar control on the Stages screen: the button, the
 * dialog every review is asked for through, and the panel that shows a
 * review running and then its results.
 *
 * The review itself lives in the store, so it carries on when this closes or
 * the researcher leaves the page, and everything here shows its current
 * state when they come back.
 */
const ReviewProtocolAction = defineToolbarChild(function ReviewProtocolAction({
  ref,
  place = null,
}: ReviewProtocolActionProps) {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { online, canRequest } = useReviewAvailability();
  const recordRead = useAppSelector(getIsProtocolReviewRecordRead);
  const run = useAppSelector(getProtocolReviewRun);
  const progress = useAppSelector(getProtocolReviewProgress);
  const counts = useAppSelector(getProtocolReviewCounts);
  const summary = useAppSelector(getProtocolReviewSummary);
  const openWizard = useStartReviewWizard();
  const protocolId = useAppSelector(getActiveProtocolId);
  const { announce } = useAccessibilityAnnouncements();

  // Whether any provider has budget left decides what the button opens, so
  // the service is asked as soon as the button is on screen, and again when
  // the connection comes back; not first when it is pressed.
  useEffect(() => {
    if (online) void dispatch(refreshReviewProviders());
  }, [dispatch, online]);

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set while the popover closes to hand the researcher to a dialog: focus
  // then belongs to the dialog, not back on the button.
  const handingOff = useRef(false);
  const returnToTrigger = useCallback(() => triggerRef.current, []);

  // A run that ends is said aloud: the popover may be closed, and the
  // button's own change is silent.
  // The review a run began from: the new one is saved a moment before the
  // run is marked finished, so the comparison is with where it started.
  const reviewId = summary?.reviewId ?? null;
  const previous = useRef({ status: run.status, startedFrom: reviewId });
  useEffect(() => {
    const before = previous.current;
    const startedFrom =
      run.status === 'running' && before.status !== 'running'
        ? reviewId
        : before.startedFrom;
    previous.current = { status: run.status, startedFrom };
    if (before.status !== 'running' || run.status === 'running') return;
    if (run.status === 'failed') {
      announce(intl.formatMessage(messages.failed));
    } else if (reviewId !== null && reviewId !== startedFrom) {
      announce(intl.formatMessage(messages.finished, { count: counts.total }));
    }
  }, [announce, counts.total, intl, reviewId, run.status]);

  // A refused start changes nothing on screen, so it is said aloud; the
  // popover shows why.
  // Started for the protocol that was open when the researcher asked. The
  // dialog waits on a save before it gets here, and a protocol opened in
  // that time is not the one they asked to have reviewed.
  const start = useCallback(async () => {
    const result = await dispatch(startReview(protocolId ?? undefined));
    if (result.status === 'refused') {
      announce(intl.formatMessage(messages.notStarted));
    }
  }, [announce, dispatch, intl, protocolId]);

  // Every review is asked for through the dialog. Completing it opens the
  // panel, where the review is seen running; leaving it returns the
  // researcher to the button.
  const requestReview = useCallback(async () => {
    handingOff.current = true;
    setOpen(false);
    const completed = await openWizard(returnToTrigger);
    handingOff.current = false;
    if (!completed) return;
    setOpen(true);
    if (online) await start();
  }, [online, openWizard, returnToTrigger, start]);

  const running = run.status === 'running';
  let icon: ReactNode = <ReviewSparklesIcon aria-hidden />;
  let label: ReactNode = intl.formatMessage(messages.reviewProtocol);
  let ariaLabel: string | undefined;
  if (running && open) {
    icon = <Loader2 className="motion-safe:animate-spin" aria-hidden />;
    label = intl.formatMessage(messages.reviewing);
  } else if (running) {
    icon = <ReviewProgressRing fraction={progress ?? 0} />;
    label = intl.formatMessage(messages.reviewing);
  } else if (summary && counts.undecided > 0) {
    ariaLabel = intl.formatMessage(messages.undecided, {
      count: counts.undecided,
    });
    label = (
      <>
        {intl.formatMessage(messages.reviewProtocol)}
        <span
          aria-hidden
          className="bg-primary text-primary-contrast ms-1 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs leading-6 font-bold"
        >
          {intl.formatNumber(counts.undecided)}
        </span>
      </>
    );
  }

  return (
    <>
      <ToolbarPopover
        ref={ref}
        open={open}
        onOpenChange={(next) => {
          // With no review, none running and nothing in the way of asking
          // for one, there is nothing for the panel to show: the button
          // goes straight to the dialog.
          if (
            next &&
            recordRead &&
            summary === null &&
            run.status === 'idle' &&
            canRequest
          ) {
            void requestReview();
            return;
          }
          if (next) handingOff.current = false;
          setOpen(next);
        }}
        contentProps={{
          'side': 'top',
          'className': 'p-0',
          // Named by its own heading, not by the button's label.
          'aria-label': undefined,
          'showArrow': true,
          'finalFocus': () => !handingOff.current,
        }}
        trigger={
          <ToolbarButton
            ref={triggerRef}
            icon={icon}
            aria-label={ariaLabel}
            aria-busy={running || undefined}
          >
            {label}
          </ToolbarButton>
        }
      >
        <ReviewPopoverContent
          onClose={() => setOpen(false)}
          onRequestReview={() => void requestReview()}
          onRetryReview={() => void start()}
          announce={announce}
          place={place}
        />
      </ToolbarPopover>
    </>
  );
});

/**
 * The Review protocol control for a toolbar at `location`, while the protocol
 * has the experiment on and this tab may edit it: on the Stages screen, where
 * reviews are asked for, and, once there is a review, in a stage's editor and
 * on the Codebook page, where its problems are fixed. Undefined everywhere
 * else.
 */
export const useReviewProtocolToolbarAction = (
  location: string,
  mode: ProjectActionsMode,
): ReactNode | undefined => {
  const enabled = useAppSelector(getIsProtocolReviewEnabled);
  const reviewed = useAppSelector(
    (state) => getProtocolReviewSummary(state) !== null,
  );
  if (!enabled || mode !== 'authoring') return undefined;
  if (location === '/protocol') {
    return <ReviewProtocolAction key="protocol-review" />;
  }
  const place = reviewPlaceAt(location);
  if (place === null || !reviewed) return undefined;
  return <ReviewProtocolAction key="protocol-review" place={place} />;
};
