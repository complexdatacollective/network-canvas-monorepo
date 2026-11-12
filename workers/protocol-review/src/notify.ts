import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import {
  ANALYTICS_DISTINCT_ID,
  POSTHOG_CAPTURE_URL,
  SERVICE_FAILURE_EVENT,
} from './constants.ts';
import type { ReviewProvider } from './contract.ts';

/**
 * Telling the team that a model provider failed. Only a fixed reason code,
 * an HTTP status and which provider it was ever leave the service this way:
 * no text, no ids, no addresses, nothing from the request or the answer.
 */
export type FailureNotice = {
  reason: string;
  status: number;
  provider: ReviewProvider;
};

/** Writes a failure to the Worker's logs. */
export type FailureLog = (notice: FailureNotice) => void;

/** Sends a failure to analytics. Resolves whether or not that succeeded. */
export type FailureNotifier = (notice: FailureNotice) => Promise<void>;

export const logFailure: FailureLog = ({ reason, status, provider }) => {
  console.error(
    `protocol_review_failure provider=${provider} reason=${reason} status=${status}`,
  );
};

export const createPostHogNotifier =
  (fetcher: typeof fetch): FailureNotifier =>
  async ({ reason, status, provider }) => {
    try {
      const response = await fetcher(POSTHOG_CAPTURE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          event: SERVICE_FAILURE_EVENT,
          distinct_id: ANALYTICS_DISTINCT_ID,
          properties: { reason, status, provider },
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
