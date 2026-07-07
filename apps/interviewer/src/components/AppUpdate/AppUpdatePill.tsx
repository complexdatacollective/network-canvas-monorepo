import AppUpdateIndicator from '@codaco/fresco-ui/appUpdate/AppUpdateIndicator';
import { APP_VERSION } from '~/lib/appVersion';

import { useAppUpdateContext } from './AppUpdateProvider';

const UPDATE_CAVEAT =
  'Your saved responses are kept when the update is applied.';

export default function AppUpdatePill() {
  const { status, availableVersion, releaseNotes, install } =
    useAppUpdateContext();

  return (
    <AppUpdateIndicator
      status={status}
      appName="Interviewer"
      label={`Interviewer ${APP_VERSION}`}
      currentVersion={APP_VERSION}
      availableVersion={availableVersion}
      releaseNotes={releaseNotes}
      onInstall={install}
      unsavedWorkCaveat={UPDATE_CAVEAT}
      size="sm"
    />
  );
}
