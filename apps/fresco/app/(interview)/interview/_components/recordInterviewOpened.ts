import 'server-only';
import { type ActivityType } from '~/app/dashboard/_components/ActivityFeed/types';
import type { ActivityLocalization } from '~/i18n/activityDetails';
import { safeRevalidateTag } from '~/lib/cache';
import { prisma } from '~/lib/db';
import { captureEvent, flushPostHog } from '~/lib/posthog-server';

/**
 * Record that an interview was opened, at most once every thirty minutes for
 * the same opener. Called only once the interview can actually be opened: a
 * refusal must not leave an activity entry claiming it was.
 */
export async function recordInterviewOpened(
  interviewId: string,
  username: string | null,
) {
  try {
    const message =
      username !== null
        ? `Interview "${interviewId}" was opened by user "${username}"`
        : `Interview "${interviewId}" was opened`;

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const recentEvent = await prisma.events.findFirst({
      where: {
        type: 'Interview Opened',
        message,
        timestamp: { gte: thirtyMinutesAgo },
      },
    });

    if (recentEvent) return;

    await prisma.events.create({
      data: {
        type: 'Interview Opened' satisfies ActivityType,
        message,
        localization: {
          kind: 'interviewOpened',
          values: {
            actor: username !== null ? 'researcher' : 'participant',
            interview: interviewId,
            username: username ?? '',
          },
        } satisfies ActivityLocalization,
      },
    });

    safeRevalidateTag('activityFeed');

    // The analytics copy of this event carries only who opened it. The feed
    // message above names the interview, and an interview id is the
    // participant's access link, so it must not leave the deployment.
    await captureEvent('Interview Opened', {
      actor: username !== null ? 'researcher' : 'participant',
    });
    await flushPostHog();
  } catch {
    // Non-critical — don't block the interview
  }
}
