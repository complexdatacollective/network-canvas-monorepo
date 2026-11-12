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
    description:
      'Heading of the page shown to anyone who opens an installation of Fresco that was not set up within the allowed time and has been locked.',
  },
  youDidNotConfigureThisDeploymentOf: {
    id: 'fresco.expired.page.youDidNotConfigureThisDeploymentOf',
    defaultMessage:
      'You did not configure this deployment of Fresco in time, and it has now been locked down for your security.',
    description:
      'Lead paragraph on the installation expired page explaining why the installation is locked: setup was not completed in time.',
  },
  pleaseRedeployANewInstanceOfFresco: {
    id: 'fresco.expired.page.pleaseRedeployANewInstanceOfFresco',
    defaultMessage:
      'Please redeploy a new instance of Fresco to continue using the software.',
    description:
      'Paragraph on the installation expired page telling the person hosting Fresco to deploy a fresh copy of the software.',
  },
  devModeResetConfiguration: {
    id: 'fresco.expired.page.devModeResetConfiguration',
    defaultMessage: 'Dev mode: Reset Configuration',
    description:
      'Button on the installation expired page, shown only in development builds, that resets the installation settings so setup can start again.',
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
          <SubmitButton
            className="mt-6 h-auto min-h-12 py-2 text-center text-wrap"
            type="submit"
          >
            {intl.formatMessage(messages.devModeResetConfiguration)}
          </SubmitButton>
        </form>
      )}
    </Surface>
  );
}
