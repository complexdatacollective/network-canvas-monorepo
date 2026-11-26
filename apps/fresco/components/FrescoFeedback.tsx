'use client';

import FeedbackDialog, {
  type FeedbackDialogProps,
} from '@codaco/fresco-ui/navigation/FeedbackDialog';
import {
  appFeedbackSurvey,
  sendAnonymousPostHogEvent,
} from '@codaco/shared-consts';
import { POSTHOG_APP_PROPERTIES } from '~/fresco.config';
import { redactParticipantLinksInText } from '~/lib/analyticsRedaction';
import { captureClientEvent } from '~/lib/posthog-client';

const sendAnonymously = sendAnonymousPostHogEvent(POSTHOG_APP_PROPERTIES);

// Opening the form is usage, which `captureClientEvent` drops on a deployment
// with analytics off. What a researcher writes and sends always goes out,
// anonymously and straight to the relay: the one request such a deployment's
// browser makes to it, made only when they press Send. A participant link in
// what they wrote loses its identifier and query string, and the rest of the
// text is kept.
const survey = appFeedbackSurvey(captureClientEvent, (event, properties) =>
  sendAnonymously(
    event,
    Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        typeof value === 'string' ? redactParticipantLinksInText(value) : value,
      ]),
    ),
  ),
);

type FrescoFeedbackProps = Pick<
  FeedbackDialogProps,
  'display' | 'renderTrigger'
>;

/** The dashboard's feedback control. */
export default function FrescoFeedback(props: FrescoFeedbackProps) {
  return <FeedbackDialog {...survey} {...props} />;
}
