import {
  buildAppSuperProperties,
  sendAnonymousPostHogEvent,
} from '@codaco/shared-consts';
import { APP_VERSION } from '~/lib/appVersion';

import { POSTHOG_APP_KEY, POSTHOG_APP_NAME } from './config';

const send = sendAnonymousPostHogEvent(
  buildAppSuperProperties({
    appKey: POSTHOG_APP_KEY,
    appName: POSTHOG_APP_NAME,
    version: APP_VERSION,
  }),
);

/** Delivers feedback written while analytics are off, anonymously. */
export function sendFeedbackEvent(
  event: string,
  properties: Record<string, unknown>,
) {
  // Builds under test make no relay requests at all.
  if (import.meta.env.VITE_DISABLE_ANALYTICS === 'true') return;
  send(event, properties);
}
