import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import {
  ANALYTICS_DISTINCT_ID,
  POSTHOG_CAPTURE_URL,
  SERVICE_FAILURE_EVENT,
} from './constants.ts';

/**
 * Telling the team that the model provider failed. Only a fixed reason code
 * and an HTTP status ever leave the service this way: no text, no ids, no
 * addresses, nothing from the request or the answer.
 */
export type FailureNotice = { reason: string; status: number };

/** Writes a failure to the Worker's logs. */
export type FailureLog = (notice: FailureNotice) => void;

/** Sends a failure to analytics. Resolves whether or not that succeeded. */
export type FailureNotifier = (notice: FailureNotice) => Promise<void>;

export const logFailure: FailureLog = ({ reason, status }) => {
  console.error(`protocol_review_failure reason=${reason} status=${status}`);
};

export const createPostHogNotifier =
  (fetcher: typeof fetch): FailureNotifier =>
  async ({ reason, status }) => {
    try {
      const response = await fetcher(POSTHOG_CAPTURE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          event: SERVICE_FAILURE_EVENT,
          distinct_id: ANALYTICS_DISTINCT_ID,
          properties: { reason, status },
        }),
      });
      if (!response.ok) {
        console.error(
          `protocol_review_notice_failed status=${response.status}`,
        );
      }
    } catch {
      console.error('protocol_review_notice_failed status=0');
    }
  };
