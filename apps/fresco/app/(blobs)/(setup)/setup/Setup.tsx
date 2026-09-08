'use client';

import { parseAsInteger, useQueryState } from 'nuqs';
import { useEffect } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { containerClasses } from '~/components/ContainerClasses';

import ConfigureStorage from '../_components/OnboardSteps/ConfigureStorage';
import CreateAccount from '../_components/OnboardSteps/CreateAccount';
import Documentation from '../_components/OnboardSteps/Documentation';
import UploadProtocol from '../_components/OnboardSteps/UploadProtocol';
import OnboardSteps from '../_components/Sidebar';
import type { SetupData } from './page';

const messages = defineMessages({
  createAccount: {
    id: 'fresco.setup.Setup.createAccount',
    defaultMessage: 'Create Account',
    description: 'Researcher-facing setup / Setup: Create Account',
  },
  configureStorage: {
    id: 'fresco.setup.Setup.configureStorage',
    defaultMessage: 'Configure Storage',
    description: 'Researcher-facing setup / Setup: Configure Storage',
  },
  uploadProtocol: {
    id: 'fresco.setup.Setup.uploadProtocol',
    defaultMessage: 'Upload Protocol',
    description: 'Researcher-facing setup / Setup: Upload Protocol',
  },
  documentation: {
    id: 'fresco.setup.Setup.documentation',
    defaultMessage: 'Documentation',
    description: 'Researcher-facing setup / Setup: Documentation',
  },
});

export default function Setup({ setupData }: { setupData: SetupData }) {
  const intl = useAppIntl();

  const [step, setStep] = useQueryState('step', parseAsInteger.withDefault(1));

  const steps = [
    {
      label: intl.formatMessage(messages.createAccount),
      content: <CreateAccount />,
    },
    {
      label: intl.formatMessage(messages.configureStorage),
      content: (
        <ConfigureStorage
          storageEnv={setupData.storageEnv}
          s3EnvValues={setupData.s3EnvValues}
        />
      ),
    },
    {
      label: intl.formatMessage(messages.uploadProtocol),
      content: <UploadProtocol />,
    },
    {
      label: intl.formatMessage(messages.documentation),
      content: <Documentation />,
    },
  ];

  // The step comes from the URL, so out-of-range values (?step=0, ?step=99)
  // must be clamped before indexing into the steps array.
  const clampedStep = Math.min(Math.max(step, 1), steps.length);

  const cardClasses = cx(
    containerClasses,
    'tablet-portrait:flex-row tablet-portrait:gap-6 flex flex-col gap-4',
  );

  useEffect(() => {
    // Redirect to step 1 if we aren't authenticated
    if (!setupData.hasAuth && step > 1) {
      void setStep(1);
      return;
    }

    // Don't show the user creation step if we _are_ authenticated
    if (setupData.hasAuth && step === 1) {
      void setStep(2);
      return;
    }
  }, [step, setStep, setupData]);

  return (
    <div className={cardClasses}>
      <OnboardSteps steps={steps.map((item) => item.label)} />
      <Surface noContainer className="w-full max-w-4xl">
        {steps[clampedStep - 1]?.content}
      </Surface>
    </div>
  );
}
