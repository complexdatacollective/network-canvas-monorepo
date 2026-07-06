import { useEffect } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

// Analytics defaults to on. The wizard reads `data.analyticsEnabled`; an
// undefined value (the user never touched the toggle) is treated as enabled.
function asAnalyticsEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

export default function Step5Analytics() {
  const wizard = useWizard();
  const enabled = asAnalyticsEnabled(wizard.data.analyticsEnabled);

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
        You can help us improve Network Canvas Interviewer 8 by sending
        anonymous usage and error data. This tells us which features are used
        and details of any errors or crashes, so we can fix bugs and decide what
        to build next.
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
