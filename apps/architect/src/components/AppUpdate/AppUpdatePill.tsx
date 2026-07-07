import AppUpdateIndicator from '@codaco/fresco-ui/appUpdate/AppUpdateIndicator';
import { appVersion } from '~/utils/appVersion';

import { useAppUpdateContext } from './AppUpdateProvider';

const UNSAVED_WORK_CAVEAT =
  'Reloading updates this tab and any other open Architect tabs; unsaved changes in progress will be lost.';

export default function AppUpdatePill() {
  const { status, availableVersion, releaseNotes, install } =
    useAppUpdateContext();

  return (
    <AppUpdateIndicator
      status={status}
      appName="Architect"
      label={`v${appVersion}`}
      currentVersion={appVersion}
      availableVersion={availableVersion}
      releaseNotes={releaseNotes}
      onInstall={install}
      unsavedWorkCaveat={UNSAVED_WORK_CAVEAT}
      size="md"
      className="bg-platinum text-charcoal shadow-sm"
      idleIcon={<span className="bg-active h-2 w-2 rounded-full" />}
    />
  );
}
