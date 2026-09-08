'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { resetAppSettings } from '~/actions/reset';
import { containerClasses } from '~/components/ContainerClasses';
import SubmitButton from '~/components/SubmitButton';
import { env } from '~/env';

const messages = defineMessages({
  installationExpired: {
    id: 'fresco.expired.page.installationExpired',
    defaultMessage: 'Installation expired',
    description: 'Researcher-facing expired / page: Installation expired',
  },
  youDidNotConfigureThisDeploymentOf: {
    id: 'fresco.expired.page.youDidNotConfigureThisDeploymentOf',
    defaultMessage:
      'You did not configure this deployment of Fresco in time, and it has now been locked down for your security.',
    description:
      'Researcher-facing expired / page: You did not configure this deployment of Fresco in time, and it has now been locked down for your security.',
  },
  pleaseRedeployANewInstanceOfFresco: {
    id: 'fresco.expired.page.pleaseRedeployANewInstanceOfFresco',
    defaultMessage:
      'Please redeploy a new instance of Fresco to continue using the software.',
    description:
      'Researcher-facing expired / page: Please redeploy a new instance of Fresco to continue using the software.',
  },
  devModeResetConfiguration: {
    id: 'fresco.expired.page.devModeResetConfiguration',
    defaultMessage: 'Dev mode: Reset Configuration',
    description:
      'Researcher-facing expired / page: Dev mode: Reset Configuration',
  },
});

export default function Page() {
  const intl = useAppIntl();

  return (
    <Surface className={cx(containerClasses, 'shadow-none')} maxWidth="md">
      <Heading level="h1">
        {intl.formatMessage(messages.installationExpired)}
      </Heading>
      <Paragraph intent="lead">
        {intl.formatMessage(messages.youDidNotConfigureThisDeploymentOf)}
      </Paragraph>
      <Paragraph>
        {intl.formatMessage(messages.pleaseRedeployANewInstanceOfFresco)}
      </Paragraph>
      {env.NODE_ENV === 'development' && (
        <form action={resetAppSettings}>
          <SubmitButton className="mt-6 max-w-80" type="submit">
            {intl.formatMessage(messages.devModeResetConfiguration)}
          </SubmitButton>
        </form>
      )}
    </Surface>
  );
}
