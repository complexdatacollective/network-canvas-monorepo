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
import type { ReleaseNotes, UpdateStatus } from './useAppUpdate';

type AppUpdateIndicatorProps = {
  status: UpdateStatus;
  appName: string;
  label: React.ReactNode;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  onInstall: () => void;
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

  const footer = isAvailable ? (
    <>
      {unsavedWorkCaveat && (
        <div className="mr-auto max-w-sm text-sm">{unsavedWorkCaveat}</div>
      )}
      <Button color="primary" onClick={onInstall}>
        Install and reload
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
