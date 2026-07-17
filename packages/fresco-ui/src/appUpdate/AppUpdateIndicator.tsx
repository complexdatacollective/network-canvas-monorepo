import { useState } from 'react';

import Button from '../Button';
import Dialog from '../dialogs/Dialog';
import Icon from '../Icon';
import Surface from '../layout/Surface';
import Pill from '../Pill';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '../RenderMarkdown';
import { ScrollArea } from '../ScrollArea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../Tooltip';
import Heading from '../typography/Heading';
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

const releaseNoteHeadingRenderers = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <Heading level="h3">{children}</Heading>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <Heading level="h3">{children}</Heading>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <Heading level="h4">{children}</Heading>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <Heading level="h4">{children}</Heading>
  ),
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

  const changelog =
    releaseNotes === 'loading' ? (
      <Paragraph margin="none">Loading release notes…</Paragraph>
    ) : releaseNotes ? (
      <RenderMarkdown
        allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
        components={releaseNoteHeadingRenderers}
      >
        {releaseNotes.body}
      </RenderMarkdown>
    ) : (
      <Paragraph margin="none">
        Release notes are unavailable right now.
      </Paragraph>
    );

  const body = (
    <Surface
      noContainer
      spacing="none"
      shadow="none"
      className="mt-4 flex max-h-72 min-h-0 flex-col"
    >
      <ScrollArea aria-label={`${appName} changelog`} viewportClassName="px-6">
        {changelog}
      </ScrollArea>
    </Surface>
  );

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

  const availableUpdateSummary = availableVersion
    ? `You are currently using version ${currentVersion}. This update will install version ${availableVersion}.`
    : `You are currently using version ${currentVersion}. This update will install the latest available version.`;

  const installFeedback =
    installState === 'installing' ? (
      <span className="mt-2 block">Installing the update…</span>
    ) : installState === 'failed' ? (
      <span role="alert" className="mt-2 block">
        The update could not be applied. Try again, or close and reopen the app.
      </span>
    ) : null;

  const description = isAvailable ? (
    <>
      <span>{availableUpdateSummary}</span>
      {unsavedWorkCaveat && (
        <span className="mt-2 block">{unsavedWorkCaveat}</span>
      )}
      <span aria-live="polite">{installFeedback}</span>
    </>
  ) : (
    'Your app was recently updated. Find details of the changes below.'
  );

  const footer = isAvailable ? (
    <>
      <Button
        disabled={installState === 'installing'}
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
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
    <Button color="primary" onClick={() => setOpen(false)}>
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
        title={isAvailable ? 'Update available' : 'App Recently Updated'}
        description={description}
        footer={footer}
      >
        {body}
      </Dialog>
    </>
  );
}
