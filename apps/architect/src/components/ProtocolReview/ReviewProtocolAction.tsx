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
import Spinner from '@codaco/fresco-ui/Spinner';
import type { ProjectActionsMode } from '~/components/ProjectNav/ProjectActions';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  getProtocolReviewCounts,
  getProtocolReviewProgress,
  getProtocolReviewRun,
  getProtocolReviewSummary,
  startReview,
} from '~/ducks/modules/protocolReview';
import {
  getIsProtocolReviewEnabled,
  getProtocolReviewStudyContext,
} from '~/selectors/protocol';

import ReviewDialog, { type ReviewDialogView } from './ReviewDialog';
import ReviewPopoverContent from './ReviewPopoverContent';
import ReviewProgressRing from './ReviewProgressRing';
import ReviewSparklesIcon from './ReviewSparklesIcon';
import { useStudyDetailsWizard } from './StudyDetailsWizard';
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
};

/**
 * The Review protocol toolbar control on the Stages screen: the button, its
 * popover, the one-problem-at-a-time dialog and the study details wizard.
 *
 * The review itself lives in the store, so it carries on when this closes or
 * the researcher leaves the page, and everything here shows its current
 * state when they come back.
 */
const ReviewProtocolAction = defineToolbarChild(function ReviewProtocolAction({
  ref,
}: ReviewProtocolActionProps) {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const availability = useReviewAvailability();
  const { online } = availability;
  const studyContext = useAppSelector(getProtocolReviewStudyContext);
  const run = useAppSelector(getProtocolReviewRun);
  const progress = useAppSelector(getProtocolReviewProgress);
  const counts = useAppSelector(getProtocolReviewCounts);
  const summary = useAppSelector(getProtocolReviewSummary);
  const openWizard = useStudyDetailsWizard();
  const { announce } = useAccessibilityAnnouncements();

  const [open, setOpen] = useState(false);
  const [dialogView, setDialogView] = useState<ReviewDialogView | null>(null);
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
  const start = useCallback(async () => {
    const result = await dispatch(startReview());
    if (result.status === 'refused') {
      announce(intl.formatMessage(messages.notStarted));
    }
  }, [announce, dispatch, intl]);

  const beginWithWizard = useCallback(async () => {
    const saved = await openWizard('start', returnToTrigger);
    if (!saved) return;
    setOpen(true);
    if (online) await start();
  }, [online, openWizard, returnToTrigger, start]);

  const editStudyDetails = useCallback(async () => {
    handingOff.current = true;
    setOpen(false);
    await openWizard('edit', returnToTrigger);
    handingOff.current = false;
    // Back to where the researcher came from, saved or not.
    setOpen(true);
  }, [openWizard, returnToTrigger]);

  const openFinding = useCallback((findingId: string) => {
    handingOff.current = true;
    setOpen(false);
    setDialogView({ kind: 'finding', findingId });
  }, []);

  const changeDialogView = useCallback((view: ReviewDialogView | null) => {
    if (view === null) handingOff.current = false;
    setDialogView(view);
  }, []);

  const reviewAgainFromSummary = useCallback(() => {
    setOpen(true);
    void start();
  }, [start]);

  const running = run.status === 'running';
  let icon: ReactNode = <ReviewSparklesIcon aria-hidden />;
  let label: ReactNode = intl.formatMessage(messages.reviewProtocol);
  let ariaLabel: string | undefined;
  if (running && open) {
    icon = <Spinner size="xs" className="m-0.5" />;
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
          if (next && !studyContext) {
            void beginWithWizard();
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
          onOpenFinding={openFinding}
          onStartReview={() => void start()}
          onEditStudyDetails={() => void editStudyDetails()}
          announce={announce}
        />
      </ToolbarPopover>
      <ReviewDialog
        view={dialogView}
        onViewChange={changeDialogView}
        onReviewAgain={reviewAgainFromSummary}
        reviewAgain={availability}
        announce={announce}
        finalFocus={returnToTrigger}
      />
    </>
  );
});

/**
 * The Review protocol control for the toolbar, where it belongs: on the
 * Stages screen, while the protocol has the experiment on and this tab may
 * edit it. Undefined everywhere else.
 */
export const useReviewProtocolToolbarAction = (
  location: string,
  mode: ProjectActionsMode,
): ReactNode | undefined => {
  const enabled = useAppSelector(getIsProtocolReviewEnabled);
  if (!enabled || mode !== 'authoring' || location !== '/protocol') {
    return undefined;
  }
  return <ReviewProtocolAction key="protocol-review" />;
};
