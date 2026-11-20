import { vi } from 'vitest';

import { posthog } from '~/analytics';

/**
 * The feedback surveys as PostHog holds them, written out again here so that
 * a test fails when `reviewAnalytics.ts` stops matching them. For a test
 * file that mocks `~/analytics`.
 */
export const PROBLEM_SURVEY_ID = '01a1f560-e7a6-0000-197a-8a38fee548d1';
export const REVIEW_SURVEY_ID = '01a1f560-e8cb-0000-f278-9ef6ad9f3bb7';
export const RATING = '$survey_response_666eab72-38ca-41d0-96f1-e8a5160624c7';
export const REASON = '$survey_response_14e70b7d-7f2f-42b0-a4da-d51a2617fca6';
export const COMMENT = '$survey_response_d1404b0d-14be-4a2f-befe-577bd0afedee';

type SurveyEvent = Record<string, unknown>;

/** Every `survey sent` event captured, in order; for one survey when named. */
export const surveyEvents = (surveyId?: string): SurveyEvent[] =>
  vi
    .mocked(posthog.capture)
    .mock.calls.filter(
      ([event, properties]) =>
        event === 'survey sent' &&
        (surveyId === undefined || properties?.$survey_id === surveyId),
    )
    .map(([, properties]) => properties ?? {});
