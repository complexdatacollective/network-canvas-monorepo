import '@tanstack/react-start/server-only';
import type {
  Activity,
  ActivityType,
} from '~/app/dashboard/_components/ActivityFeed/types';
import { prisma } from '~/lib/db';
import { captureEvent, shutdownPostHog } from '~/lib/posthog-server';

/**
 * `actions/activityFeed.ts`'s `addEvent`, minus two Next.js mechanisms:
 *
 * - `safeUpdateTag('activityFeed')` — there is no server cache to invalidate
 *   under cache option (i).
 * - `after()` — spike S4 established that on a long-lived Node server a
 *   promise started in a handler settles normally after the response is sent,
 *   so the PostHog flush is plain fire-and-forget. This does NOT hold on
 *   Netlify, where the invocation can be frozen once the response returns.
 */
export async function addEvent(
  type: ActivityType,
  message: Activity['message'],
  properties?: Record<string, unknown>,
) {
  try {
    await prisma.events.create({ data: { type, message } });

    void (async () => {
      await captureEvent(type, { message, ...properties });
      await shutdownPostHog();
    })();

    return { success: true, error: null };
  } catch (_error) {
    return { success: false, error: 'Failed to add event' };
  }
}
