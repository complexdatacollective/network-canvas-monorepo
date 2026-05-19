import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import * as authApi from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';
import { updateSettings } from '~/lib/db/api';
import { isElectron } from '~/lib/platform/platform';

import Step1Intro from './SetupWizard/Step1Intro';
import Step2MethodPicker from './SetupWizard/Step2MethodPicker';
import Step3Configure from './SetupWizard/Step3Configure';
import Step4Behavior from './SetupWizard/Step4Behavior';

export type WizardSelectedMethod = 'biometric' | 'pin' | 'passphrase';

export type SetupWizardData = {
  selectedMethod: WizardSelectedMethod | null;
  enrolmentCommitted: boolean;
  behavior: {
    idleTimeoutMinutes: IdleTimeoutMinutes;
    requireUnlockOnResume: boolean;
    requireUnlockOnExport: boolean;
  };
};

const DEFAULT_BEHAVIOR: SetupWizardData['behavior'] = {
  idleTimeoutMinutes: 15,
  requireUnlockOnResume: true,
  requireUnlockOnExport: false,
};

export function useSetupWizard() {
  const { openDialog } = useDialog();
  const { refresh } = useAuth();

  const openSetupWizard = async (): Promise<void> => {
    const result = await openDialog({
      type: 'wizard',
      title: 'Secure this device',
      confirmCancel: {
        title: 'Continue without app security?',
        description: isElectron
          ? 'Your data will be stored without encryption on this device. Anyone with access to the device or its files will be able to read all collected data. You can enable security later from Settings, but this will require wiping all data.'
          : 'Your data is sandboxed by the operating system and is not directly accessible to other apps. Enabling app security adds protection if the device itself is unlocked and physically accessed. You can enable security later from Settings.',
      },
      cancelLabel: 'Skip',
      steps: [
        { title: 'Secure this device', content: Step1Intro },
        {
          title: 'Choose a method',
          description: 'Pick how you want to unlock this device.',
          content: Step2MethodPicker,
        },
        {
          title: 'Set up your method',
          content: Step3Configure,
        },
        {
          title: 'Lock behavior',
          description: 'Decide when the app re-locks.',
          content: Step4Behavior,
          nextLabel: 'Finish',
        },
      ],
    });

    if (!result) {
      // Dismissed — if a previous step committed enrolment, revoke it before
      // falling back to mode: none.
      const status = await authApi.status();
      if (status.configured && status.mode !== 'none') {
        await authApi.revoke();
      }
      await authApi.enrolWithoutLock();
    } else {
      const data = result as SetupWizardData;
      const behavior = data.behavior ?? DEFAULT_BEHAVIOR;
      await updateSettings({
        idleTimeoutMinutes: behavior.idleTimeoutMinutes,
        requireUnlockOnResume: behavior.requireUnlockOnResume,
        requireUnlockOnExport: behavior.requireUnlockOnExport,
      });
    }

    await refresh();
  };

  return { openSetupWizard };
}
