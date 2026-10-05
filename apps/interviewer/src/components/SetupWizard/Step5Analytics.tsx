import { useEffect } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const messages = defineMessages({
  finish: {
    id: 'interviewer.step5Analytics.finish',
    defaultMessage: 'Finish',
    description:
      'Final wizard action that applies the analytics preference and completes device setup.',
  },
  youCanHelpUsImproveNetworkCanvas: {
    id: 'interviewer.step5Analytics.youCanHelpUsImproveNetworkCanvas',
    defaultMessage:
      'You can help us improve Network Canvas Interviewer by sending anonymous usage and error data. This tells us which features are used and details of any errors or crashes, so we can fix bugs and decide what to build next.',
    description: 'Visible copy in Interviewer Step5Analytics.',
  },
  sendAnonymousAnalytics: {
    id: 'interviewer.step5Analytics.sendAnonymousAnalytics',
    defaultMessage: 'Send anonymous analytics',
    description: 'The label label in Interviewer Step5Analytics.',
  },
  noParticipantOrPersonalDataIsCollected: {
    id: 'interviewer.step5Analytics.noParticipantOrPersonalDataIsCollected',
    defaultMessage: 'No participant or personal data is collected',
    description: 'Visible copy in Interviewer Step5Analytics.',
  },
  networkDataInterviewResponsesCaseIDsAnd: {
    id: 'interviewer.step5Analytics.networkDataInterviewResponsesCaseIDsAnd',
    defaultMessage:
      'Network data, interview responses, case IDs, and protocol contents never leave this device. Analytics contain no user-identifiable information — events are tied only to a random per-device installation ID, never your name, email, or any account. You can change this any time in Settings → Privacy.',
    description: 'Visible copy in Interviewer Step5Analytics.',
  },
});

// First-run setup defaults analytics to on. A Settings-launched wizard supplies
// the user's current preference instead, so leaving the toggle untouched cannot
// silently opt an existing user back in.
function asAnalyticsEnabled(value: unknown, initialEnabled: boolean): boolean {
  return typeof value === 'boolean' ? value : initialEnabled;
}

export default function Step5Analytics({
  initialEnabled = true,
}: {
  initialEnabled?: boolean;
}) {
  const intl = useAppIntl();
  const wizard = useWizard();
  const enabled = asAnalyticsEnabled(
    wizard.data.analyticsEnabled,
    initialEnabled,
  );

  useEffect(() => {
    wizard.setNextEnabled(true);
    wizard.setNextLabel(intl.formatMessage(messages.finish));
    wizard.setBeforeNext(null);
    return () => {
      wizard.setNextLabel(intl.formatMessage(commonMessages.continue));
    };
  }, [intl, wizard]);

  return (
    <>
      <Paragraph>
        {intl.formatMessage(messages.youCanHelpUsImproveNetworkCanvas)}
      </Paragraph>
      <UnconnectedField
        name="analyticsEnabled"
        label={intl.formatMessage(messages.sendAnonymousAnalytics)}
        inline
        component={ToggleField}
        value={enabled}
        onChange={(next: boolean | undefined) =>
          wizard.setStepData({ analyticsEnabled: next === true })
        }
      />
      <Alert variant="info">
        <AlertTitle>
          {intl.formatMessage(messages.noParticipantOrPersonalDataIsCollected)}
        </AlertTitle>
        <AlertDescription>
          {intl.formatMessage(messages.networkDataInterviewResponsesCaseIDsAnd)}
        </AlertDescription>
      </Alert>
    </>
  );
}
