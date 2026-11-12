'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

const messages = defineMessages({
  sandboxCredentials: {
    id: 'fresco.SandboxCredentials.sandboxCredentials',
    defaultMessage: 'Sandbox Credentials',
    description:
      'Title of an information box on the sign-in page of the public demo (sandbox) installation, giving the shared demo account details.',
  },
  username: {
    id: 'fresco.SandboxCredentials.username',
    defaultMessage: 'Username:',
    description:
      'Label before the demo account username in the sandbox information box; the value follows it.',
  },
  admin: {
    id: 'fresco.SandboxCredentials.admin',
    defaultMessage: 'admin',
    description:
      'The literal demo account username shown in the sandbox information box. It is typed into the sign-in form, so it should normally not be translated.',
  },
  password: {
    id: 'fresco.SandboxCredentials.password',
    defaultMessage: 'Password:',
    description:
      'Label before the demo account password in the sandbox information box; the value follows it.',
  },
  administrator1: {
    id: 'fresco.SandboxCredentials.administrator1',
    defaultMessage: 'Administrator1!',
    description:
      'The literal demo account password shown in the sandbox information box. It is typed into the sign-in form, so it must not be translated.',
  },
  theSandboxIsASharedExampleEnvironment: {
    id: 'fresco.SandboxCredentials.theSandboxIsASharedExampleEnvironment',
    defaultMessage:
      'The sandbox is a shared example environment not intended for real interviews.',
    description:
      'Warning sentence in the sandbox information box, followed directly by another sentence in bold. Says the demo installation is shared and must not be used for real interviews.',
  },
  allUploadedDataIsPublic: {
    id: 'fresco.SandboxCredentials.allUploadedDataIsPublic',
    defaultMessage: 'All uploaded data is public.',
    description:
      'Bold warning sentence in the sandbox information box, shown right after the previous sentence: anything uploaded to the demo installation can be seen by everyone.',
  },
});

/**
 * Rendered only by sandbox deployments. The `SANDBOX_MODE` check belongs to the
 * server component that renders this one — see `NetlifyBadge` for why.
 */
export default function SandboxCredentials() {
  const intl = useAppIntl();

  return (
    <Alert variant="info">
      <AlertTitle>{intl.formatMessage(messages.sandboxCredentials)}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col space-y-2">
          <div>
            <div>
              <span className="me-2 font-semibold">
                {intl.formatMessage(messages.username)}
              </span>
              <span>{intl.formatMessage(messages.admin)}</span>
            </div>
            <div>
              <span className="me-2 font-semibold">
                {intl.formatMessage(messages.password)}
              </span>
              <span>{intl.formatMessage(messages.administrator1)}</span>
            </div>
          </div>

          <div>
            {intl.formatMessage(messages.theSandboxIsASharedExampleEnvironment)}
            <span className="font-semibold">
              {intl.formatMessage(messages.allUploadedDataIsPublic)}
            </span>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
