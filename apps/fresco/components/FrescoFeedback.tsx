'use client';

import { useSyncExternalStore } from 'react';

import FeedbackPopover, {
  type FeedbackPopoverProps,
} from '@codaco/fresco-ui/navigation/FeedbackPopover';
import {
  appFeedbackSurvey,
  sendAnonymousPostHogEvent,
} from '@codaco/shared-consts';
import { POSTHOG_APP_PROPERTIES } from '~/fresco.config';
import { redactProperties } from '~/lib/analyticsRedaction';
import {
  captureClientEvent,
  isAnalyticsEnabled,
  subscribeToAnalyticsEnabled,
} from '~/lib/posthog-client';

const sendAnonymously = sendAnonymousPostHogEvent(POSTHOG_APP_PROPERTIES);

const withAnalytics = appFeedbackSurvey(captureClientEvent);

// What a researcher writes and sends goes out even on a deployment with
// analytics off: the one request such a deployment's browser makes to the
// relay, made only when they press Send, and carrying no installation ID.
const withoutAnalytics = appFeedbackSurvey(
  captureClientEvent,
  (event, properties) => sendAnonymously(event, redactProperties(properties)),
);

type FrescoFeedbackProps = Pick<
  FeedbackPopoverProps,
  'display' | 'renderTrigger'
>;

/** The dashboard's feedback control. */
export default function FrescoFeedback(props: FrescoFeedbackProps) {
  const analyticsEnabled = useSyncExternalStore(
    subscribeToAnalyticsEnabled,
    isAnalyticsEnabled,
    () => false,
  );
  return (
    <FeedbackPopover
      {...(analyticsEnabled ? withAnalytics : withoutAnalytics)}
      {...props}
    />
  );
}
