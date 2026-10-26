import { useEffect } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import SecurityBehaviorControls from '~/components/SecurityBehaviorControls';

import { asBehavior } from './wizardData';

export default function Step4Behavior() {
  const intl = useAppIntl();
  const wizard = useWizard();
  const behavior = asBehavior(wizard.data.behavior);

  useEffect(() => {
    wizard.setNextEnabled(true);
    wizard.setNextLabel(intl.formatMessage(commonMessages.continue));
    wizard.setBeforeNext(null);
  }, [intl, wizard]);

  return (
    <SecurityBehaviorControls
      value={behavior}
      onChange={(next) => wizard.setStepData({ behavior: next })}
    />
  );
}
