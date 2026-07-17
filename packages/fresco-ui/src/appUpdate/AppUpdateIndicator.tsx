import { useState } from 'react';

import Button from '../Button';
import Dialog from '../dialogs/Dialog';
import Icon from '../Icon';
import Pill from '../Pill';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '../RenderMarkdown';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../Tooltip';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import type {
  InstallAppUpdate,
  ReleaseNotes,
  UpdateStatus,
} from './useAppUpdate';

type AppUpdateIndicatorProps = {
  status: UpdateStatus;
  appName: string;
  label: React.ReactNode;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  onInstall: InstallAppUpdate;
  unsavedWorkCaveat?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  idleIcon?: React.ReactNode;
};

export default function AppUpdateIndicator({
  status,
  appName,
  label,
  currentVersion,
  availableVersion,
  releaseNotes,
  onInstall,
  unsavedWorkCaveat,
  size = 'md',
  className,
  idleIcon,
}: AppUpdateIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [installState, setInstallState] = useState<
    'idle' | 'installing' | 'failed'
  >('idle');

  if (status === 'idle') {
    return (
      <Pill size={size} variant="ghost" className={className} icon={idleIcon}>
        {label}
      </Pill>
    );
  }

  const isAvailable = status === 'available';

  const pillButton = (
    <Pill
      as="button"
      size={size}
      variant="ghost"
      icon={
        <Icon name={isAvailable ? 'RefreshCw' : 'Check'} className="size-3.5" />
      }
      onClick={() => setOpen(true)}
      aria-label={
        isAvailable
          ? `An update is available. View what's new in ${appName}.`
          : `${appName} was updated. View what's new.`
      }
      className={cx(
        'focusable cursor-pointer transition-colors',
        isAvailable
          ? 'bg-sea-serpent/20 text-sea-serpent hover:bg-sea-serpent/30'
          : 'bg-sea-green/20 text-sea-green hover:bg-sea-green/30',
      )}
    >
      {label}
    </Pill>
  );

  const body =
    releaseNotes === 'loading' ? (
      <Paragraph margin="none">Loading release notes…</Paragraph>
    ) : releaseNotes ? (
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {releaseNotes.body}
      </RenderMarkdown>
    ) : (
      <Paragraph margin="none">
        Release notes are unavailable right now.
      </Paragraph>
    );

  const shownVersion = isAvailable ? availableVersion : currentVersion;

  const handleInstall = async () => {
    if (installState === 'installing') return;
    setInstallState('installing');

    try {
      if ((await onInstall()) !== false) return;
    } catch {
      // The actionable failure state below covers registration and activation
      // errors without exposing service-worker internals to the researcher.
    }

    setInstallState('failed');
  };

  const footer = isAvailable ? (
    <>
      <div className="mr-auto max-w-sm text-sm" aria-live="polite">
        {installState === 'installing' ? (
          <span>Installing the update…</span>
        ) : installState === 'failed' ? (
          <span role="alert">
            The update could not be applied. Try again, or close and reopen the
            app.
          </span>
        ) : (
          unsavedWorkCaveat
        )}
      </div>
      <Button
        color="primary"
        disabled={installState === 'installing'}
        icon={
          installState === 'installing' ? (
            <Icon name="LoaderCircle" className="size-4 animate-spin" />
          ) : undefined
        }
        onClick={() => void handleInstall()}
      >
        {installState === 'installing'
          ? 'Installing…'
          : installState === 'failed'
            ? 'Try again'
            : 'Install and reload'}
      </Button>
    </>
  ) : (
    <Button variant="text" onClick={() => setOpen(false)}>
      Close
    </Button>
  );

  return (
    <>
      {isAvailable ? (
        pillButton
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={pillButton} />
            <TooltipContent>{appName} was updated!</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={isAvailable ? 'Update available' : `What's new in ${appName}`}
        description={shownVersion ? `Version ${shownVersion}` : undefined}
        footer={footer}
      >
        {body}
      </Dialog>
    </>
  );
}
