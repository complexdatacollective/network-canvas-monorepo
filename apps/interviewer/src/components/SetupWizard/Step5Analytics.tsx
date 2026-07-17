import { useEffect } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

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
  const wizard = useWizard();
  const enabled = asAnalyticsEnabled(
    wizard.data.analyticsEnabled,
    initialEnabled,
  );

  useEffect(() => {
    wizard.setNextEnabled(true);
    wizard.setNextLabel('Finish');
    wizard.setBeforeNext(null);
    return () => {
      wizard.setNextLabel('Continue');
    };
  }, [wizard]);

  return (
    <>
      <Paragraph>
        You can help us improve Network Canvas Interviewer by sending anonymous
        usage and error data. This tells us which features are used and details
        of any errors or crashes, so we can fix bugs and decide what to build
        next.
      </Paragraph>
      <UnconnectedField
        name="analyticsEnabled"
        label="Send anonymous analytics"
        inline
        component={ToggleField}
        value={enabled}
        onChange={(next: boolean | undefined) =>
          wizard.setStepData({ analyticsEnabled: next === true })
        }
      />
      <Alert variant="info">
        <AlertTitle>No participant or personal data is collected</AlertTitle>
        <AlertDescription>
          Network data, interview responses, case IDs, and protocol contents
          never leave this device. Analytics contain no user-identifiable
          information — events are tied only to a random per-device installation
          ID, never your name, email, or any account. You can change this any
          time in Settings → Privacy.
        </AlertDescription>
      </Alert>
    </>
  );
}
