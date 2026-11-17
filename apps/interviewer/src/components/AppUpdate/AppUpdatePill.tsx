import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AppUpdateIndicator from '@codaco/fresco-ui/appUpdate/AppUpdateIndicator';
import { APP_VERSION } from '~/lib/appVersion';

import { useAppUpdateContext } from './AppUpdateProvider';

const messages = defineMessages({
  updateCaveat: {
    id: 'interviewer.appUpdatePill.updateCaveat',
    defaultMessage: 'Your saved responses are kept when the update is applied.',
    description:
      'Reassurance in the app update popover on the home screen; says saved responses are kept when the update is applied.',
  },
  version: {
    id: 'interviewer.appUpdatePill.version',
    defaultMessage: 'Interviewer {version}',
    description:
      'Label of the version indicator at the bottom right of the home screen. version is the installed app version number.',
  },
});

export default function AppUpdatePill() {
  const intl = useAppIntl();
  const { status, availableVersion, releaseNotes, install } =
    useAppUpdateContext();

  return (
    <AppUpdateIndicator
      status={status}
      appName="Interviewer"
      label={intl.formatMessage(messages.version, { version: APP_VERSION })}
      currentVersion={APP_VERSION}
      availableVersion={availableVersion}
      releaseNotes={releaseNotes}
      onInstall={install}
      unsavedWorkCaveat={intl.formatMessage(messages.updateCaveat)}
    />
  );
}
