import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

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

const messages = defineMessages({
  updateAvailablePill: {
    id: 'frescoUi.appUpdateIndicator.updateAvailablePill',
    defaultMessage: "An update is available. View what's new in {appName}.",
    description:
      'Accessible name of the indicator pill while an update is waiting to install.',
  },
  updatedPill: {
    id: 'frescoUi.appUpdateIndicator.updatedPill',
    defaultMessage: "{appName} was updated. View what's new.",
    description:
      'Accessible name of the indicator pill after an update was applied.',
  },
  loadingReleaseNotes: {
    id: 'frescoUi.appUpdateIndicator.loadingReleaseNotes',
    defaultMessage: 'Loading release notes…',
    description: 'Shown in the update dialog while release notes load.',
  },
  releaseNotesUnavailable: {
    id: 'frescoUi.appUpdateIndicator.releaseNotesUnavailable',
    defaultMessage: 'Release notes are unavailable right now.',
    description:
      'Shown in the update dialog when release notes could not be loaded.',
  },
  changelogLabel: {
    id: 'frescoUi.appUpdateIndicator.changelogLabel',
    defaultMessage: '{appName} changelog',
    description:
      'Accessible name of the scrollable release-notes region in the update dialog.',
  },
  availableSummaryKnownVersion: {
    id: 'frescoUi.appUpdateIndicator.availableSummaryKnownVersion',
    defaultMessage:
      'You are currently using version {currentVersion}. This update will install version {availableVersion}.',
    description:
      'Update dialog summary when the incoming version number is known.',
  },
  availableSummaryLatest: {
    id: 'frescoUi.appUpdateIndicator.availableSummaryLatest',
    defaultMessage:
      'You are currently using version {currentVersion}. This update will install the latest available version.',
    description:
      'Update dialog summary when the incoming version number is not known.',
  },
  installing: {
    id: 'frescoUi.appUpdateIndicator.installing',
    defaultMessage: 'Installing the update…',
    description: 'Progress feedback while the update is being applied.',
  },
  installFailed: {
    id: 'frescoUi.appUpdateIndicator.installFailed',
    defaultMessage:
      'The update could not be applied. Try again, or close and reopen the app.',
    description: 'Error feedback when applying the update failed.',
  },
  recentlyUpdatedBody: {
    id: 'frescoUi.appUpdateIndicator.recentlyUpdatedBody',
    defaultMessage:
      'Your app was recently updated. Find details of the changes below.',
    description:
      'Update dialog description after an update has already been applied.',
  },
  installingButton: {
    id: 'frescoUi.appUpdateIndicator.installingButton',
    defaultMessage: 'Installing…',
    description: 'Install button label while the update is being applied.',
  },
  installAndReload: {
    id: 'frescoUi.appUpdateIndicator.installAndReload',
    defaultMessage: 'Install and reload',
    description:
      'Install button label that applies the update and reloads the app.',
  },
  updatedTooltip: {
    id: 'frescoUi.appUpdateIndicator.updatedTooltip',
    defaultMessage: '{appName} was updated!',
    description: 'Tooltip on the indicator pill after an update was applied.',
  },
  updateAvailableTitle: {
    id: 'frescoUi.appUpdateIndicator.updateAvailableTitle',
    defaultMessage: 'Update available',
    description:
      'Title of the update dialog while an update is waiting to install.',
  },
  recentlyUpdatedTitle: {
    id: 'frescoUi.appUpdateIndicator.recentlyUpdatedTitle',
    defaultMessage: 'App Recently Updated',
    description:
      'Title of the update dialog after an update was already applied.',
  },
});

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
  const intl = useAppIntl();
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
      aria-label={intl.formatMessage(
        isAvailable ? messages.updateAvailablePill : messages.updatedPill,
        { appName },
      )}
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
      <Paragraph margin="none">
        {intl.formatMessage(messages.loadingReleaseNotes)}
      </Paragraph>
    ) : releaseNotes ? (
      <RenderMarkdown
        allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
        components={releaseNoteHeadingRenderers}
      >
        {releaseNotes.body}
      </RenderMarkdown>
    ) : (
      <Paragraph margin="none">
        {intl.formatMessage(messages.releaseNotesUnavailable)}
      </Paragraph>
    );

  const body = (
    <Surface
      noContainer
      spacing="none"
      shadow="none"
      className="mt-4 flex max-h-72 min-h-0 flex-col"
    >
      <ScrollArea
        aria-label={intl.formatMessage(messages.changelogLabel, { appName })}
        viewportClassName="px-6"
      >
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
    ? intl.formatMessage(messages.availableSummaryKnownVersion, {
        currentVersion,
        availableVersion,
      })
    : intl.formatMessage(messages.availableSummaryLatest, { currentVersion });

  const installFeedback =
    installState === 'installing' ? (
      <span className="mt-2 block">
        {intl.formatMessage(messages.installing)}
      </span>
    ) : installState === 'failed' ? (
      <span role="alert" className="mt-2 block">
        {intl.formatMessage(messages.installFailed)}
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
    intl.formatMessage(messages.recentlyUpdatedBody)
  );

  const footer = isAvailable ? (
    <>
      <Button
        disabled={installState === 'installing'}
        onClick={() => setOpen(false)}
      >
        {intl.formatMessage(commonMessages.cancel)}
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
          ? intl.formatMessage(messages.installingButton)
          : installState === 'failed'
            ? intl.formatMessage(commonMessages.retry)
            : intl.formatMessage(messages.installAndReload)}
      </Button>
    </>
  ) : (
    <Button color="primary" onClick={() => setOpen(false)}>
      {intl.formatMessage(commonMessages.close)}
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
            <TooltipContent>
              {intl.formatMessage(messages.updatedTooltip, { appName })}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={intl.formatMessage(
          isAvailable
            ? messages.updateAvailableTitle
            : messages.recentlyUpdatedTitle,
        )}
        description={description}
        footer={footer}
      >
        {body}
      </Dialog>
    </>
  );
}
