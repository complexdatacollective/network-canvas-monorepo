import { useEffect } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { isElectron } from '~/lib/platform/platform';

export default function Step1Intro() {
  const { setNextEnabled } = useWizard();

  useEffect(() => {
    setNextEnabled(true);
  }, [setNextEnabled]);

  return (
    <>
      <Paragraph>
        This wizard will help you set up app-level security for Network Canvas
        Interviewer. You can choose a biometric method, a PIN code, or a
        passphrase to lock the app and protect your collected data. You can
        change or remove security at any time from Settings.
      </Paragraph>
      {isElectron ? (
        <Alert variant="warning">
          <AlertTitle>Encryption required for data protection</AlertTitle>
          <AlertDescription>
            If you do not enable security, your data will be stored without
            encryption on this device. Anyone with access to this device or its
            files will be able to read all collected data.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info">
          <AlertTitle>
            Platform sandboxing provides baseline protection
          </AlertTitle>
          <AlertDescription>
            Even without app security, your data is sandboxed by the operating
            system and is not directly accessible to other apps. Enabling app
            security adds protection if the device itself is unlocked and
            physically accessed by someone else.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
