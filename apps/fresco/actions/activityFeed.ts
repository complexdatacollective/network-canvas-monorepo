'use server';

import { after } from 'next/server';

import type {
  Activity,
  ActivityType,
} from '~/app/dashboard/_components/ActivityFeed/types';
import { requireApiAuth } from '~/lib/auth/guards';
import { safeUpdateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { captureEvent, shutdownPostHog } from '~/lib/posthog-server';

type NewActivity = {
  type: ActivityType;
  message: Activity['message'];
  properties?: Record<string, unknown>;
};

/**
 * Records activity in the dashboard feed and reports it to analytics.
 *
 * The analytics callback is registered before the first await. Almost every
 * caller invokes these without awaiting them, so a callback scheduled after a
 * suspension point races the enclosing action's response: by the time it ran
 * the request scope had gone, `after` threw, and the catch below swallowed it.
 * That is why only the two awaited callers ever reached analytics.
 *
 * One callback covers the whole batch. Each ends by shutting the PostHog
 * client down, so a callback per activity would race its own siblings.
 *
 * `message` is deliberately not reported. It is prose written for the
 * researcher reading the feed, and it embeds usernames and — for interview
 * activity — participant labels and identifiers. Only the activity type and
 * explicitly-passed properties leave the installation.
 */
async function recordActivity(activities: NewActivity[]) {
  if (activities.length === 0) {
    return { success: true, error: null };
  }

  after(async () => {
    for (const { type, properties } of activities) {
      await captureEvent(type, properties);
    }

    await shutdownPostHog();
  });

  try {
    await prisma.events.createMany({
      data: activities.map(({ type, message }) => ({ type, message })),
    });

    safeUpdateTag('activityFeed');

    return { success: true, error: null };
  } catch (_error) {
    return { success: false, error: 'Failed to add event' };
  }
}

export async function addEvent(
  type: ActivityType,
  message: Activity['message'],
  properties?: Record<string, unknown>,
) {
  return recordActivity([{ type, message, properties }]);
}

/**
 * Records several activities at once, for actions that operate on a selection
 * and describe each item separately in the feed.
 */
export async function addEvents(activities: NewActivity[]) {
  return recordActivity(activities);
}

export async function getActivitiesForExport(): Promise<Activity[]> {
  await requireApiAuth();

  return prisma.events.findMany({
    select: { id: true, timestamp: true, type: true, message: true },
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
  });
}
