import { shallowEqual } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { REVIEW_LIMITS } from '@codaco/protocol-review-worker/contract';
import { useAppSelector } from '~/ducks/hooks';
import {
  getProtocolReviewQuota,
  getProtocolReviewRun,
  getProtocolReviewStartBlock,
} from '~/ducks/modules/protocolReview';

import { formatWhen } from './reviewText';
import { useNowUntil, useOnline } from './useReviewClock';

const messages = defineMessages({
  unchanged: {
    id: 'architect.protocolReview.availability.unchanged',
    defaultMessage: 'Nothing has changed since this review.',
    description:
      'Why Review again is unavailable: neither the protocol nor the study details changed since the last review.',
  },
  offline: {
    id: 'architect.protocolReview.availability.offline',
    defaultMessage: 'Offline',
    description:
      'Why the review buttons are unavailable: there is no internet connection.',
  },
  nextReviewAt: {
    id: 'architect.protocolReview.availability.nextReviewAt',
    defaultMessage: 'Next review {when}',
    description:
      'Why Review again is unavailable: the hourly limit is used up. {when} is a time such as "today at 15:32".',
  },
  availableAgainAt: {
    id: 'architect.protocolReview.availability.availableAgainAt',
    defaultMessage: 'Available again {when}',
    description:
      'Why Review again is unavailable: the service’s shared budget for the day or the month is spent. {when} is a moment such as "tomorrow at 01:00" or "1 Dec 2026 at 01:00".',
  },
});

export type ReviewAvailability = {
  /** The time this was worked out for; moves on when a limit lifts. */
  now: number;
  online: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds a failed run said to try again at; null when none. */
  retryAt: number | null;
  /** When the hourly limit lifts, while it is reached; otherwise null. */
  hourlyResetsAt: number | null;
  /** Whether a new review can be started now. */
  canStart: boolean;
  /** Why not, in words, when there is something to tell the researcher. */
  reason: string | null;
};

/**
 * Whether a new review can start, and why not: the engine's start block,
 * being offline, and a spent daily or monthly budget that the service said
 * when it restarts. Moves on by itself when a limit lifts.
 */
export const useReviewAvailability = (): ReviewAvailability => {
  const intl = useAppIntl();
  const online = useOnline();
  const run = useAppSelector(getProtocolReviewRun);
  const storedQuota = useAppSelector((state) => state.protocolReview.quota);
  const retryAt =
    run.status === 'failed' && run.retryAt !== null
      ? Date.parse(run.retryAt)
      : null;
  const now = useNowUntil([
    storedQuota ? Date.parse(storedQuota.resetsAt) : null,
    retryAt,
  ]);
  const quota = useAppSelector(
    (state) => getProtocolReviewQuota(state, now),
    shallowEqual,
  );
  const block = useAppSelector(
    (state) => getProtocolReviewStartBlock(state, now),
    shallowEqual,
  );

  const limit = quota?.limit ?? REVIEW_LIMITS.perInstallationPerHour;
  const remaining = quota?.remaining ?? limit;
  const hourlyResetsAt =
    block?.code === 'hourly_limit'
      ? Date.parse(block.resetsAt)
      : run.status === 'failed' && run.code === 'hourly_limit'
        ? (retryAt ?? (quota ? Date.parse(quota.resetsAt) : null))
        : null;
  const budgetSpent =
    run.status === 'failed' &&
    (run.code === 'daily_limit' || run.code === 'monthly_limit') &&
    retryAt !== null &&
    retryAt > now;

  let reason: string | null = null;
  if (!online) {
    reason = intl.formatMessage(messages.offline);
  } else if (block?.code === 'unchanged') {
    reason = intl.formatMessage(messages.unchanged);
  } else if (block?.code === 'hourly_limit') {
    reason = intl.formatMessage(messages.nextReviewAt, {
      when: formatWhen(intl, Date.parse(block.resetsAt), now),
    });
  } else if (budgetSpent) {
    reason = intl.formatMessage(messages.availableAgainAt, {
      when: formatWhen(intl, retryAt, now),
    });
  }

  return {
    now,
    online,
    limit,
    remaining,
    retryAt,
    hourlyResetsAt,
    canStart: online && block === null && !budgetSpent,
    reason,
  };
};
