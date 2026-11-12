import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AppUpdateIndicator from '@codaco/fresco-ui/appUpdate/AppUpdateIndicator';
import { appVersion } from '~/utils/appVersion';

import { useAppUpdateContext } from './AppUpdateProvider';
const messages = defineMessages({
  v: {
    id: 'architect.appUpdate.appUpdatePill.v',
    defaultMessage: 'v{appVersion}',
    description:
      'Label of the pill in the Architect header showing the installed app version. appVersion is the version number, for example 9.0.1; the leading v stands for version.',
  },
});

const UNSAVED_WORK_CAVEAT = defineMessages({
  message: {
    id: 'architect.notice.unsavedWorkCaveat',
    defaultMessage:
      'Installing the update will reload only this tab. Any unsaved work in this tab will be lost. Other open Architect tabs will keep running until they are reloaded.',
    description:
      'Warning shown with the update-available pill, before the researcher installs a new Architect version. Explains that installing reloads only the current browser tab, so unsaved work in this tab is lost, while other open Architect tabs keep running.',
  },
}).message;

export default function AppUpdatePill() {
  const intl = useAppIntl();
  const { status, availableVersion, releaseNotes, install } =
    useAppUpdateContext();

  return (
    <AppUpdateIndicator
      status={status}
      appName="Architect"
      label={intl.formatMessage(messages.v, { appVersion: appVersion })}
      currentVersion={appVersion}
      availableVersion={availableVersion}
      releaseNotes={releaseNotes}
      onInstall={install}
      unsavedWorkCaveat={intl.formatMessage(UNSAVED_WORK_CAVEAT)}
      size="md"
      className="bg-platinum text-charcoal shadow-sm"
      idleIcon={<span className="bg-active h-2 w-2 rounded-full" />}
    />
  );
}
