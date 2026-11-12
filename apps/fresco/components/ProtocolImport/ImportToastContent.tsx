'use client';
import {
  Database,
  FileSearch,
  FileUp,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { type ImportPhase } from './calculateImportProgress';

const messages = defineMessages({
  failed: {
    id: 'fresco.ImportToastContent.failed',
    defaultMessage: 'Import failed',
    description:
      'Title of the protocol import toast when importing a protocol file has failed; the error and a retry button appear under it.',
  },

  complete: {
    id: 'fresco.ImportToastContent.complete',
    defaultMessage: 'Import complete',
    description:
      'Title of the protocol import toast when a protocol file has been imported successfully.',
  },

  saving: {
    id: 'fresco.ImportToastContent.saving',
    defaultMessage: 'Saving...',
    description:
      'Progress step shown in the protocol import toast while the imported protocol is being saved to the database.',
  },

  uploadingAssets: {
    id: 'fresco.ImportToastContent.uploadingAssets',
    defaultMessage: 'Uploading assets...',
    description:
      "Progress step shown in the protocol import toast while the protocol's media files (images, audio, video) are uploaded to storage.",
  },

  uploadingProtocol: {
    id: 'fresco.ImportToastContent.uploadingProtocol',
    defaultMessage: 'Uploading protocol...',
    description:
      'Progress step shown in the protocol import toast while the protocol file itself is uploaded to storage.',
  },

  extracting: {
    id: 'fresco.ImportToastContent.extracting',
    defaultMessage: 'Extracting assets...',
    description:
      'Progress step shown in the protocol import toast while the media files are unpacked from the protocol file.',
  },

  duplicates: {
    id: 'fresco.ImportToastContent.duplicates',
    defaultMessage: 'Checking duplicates...',
    description:
      'Progress step shown in the protocol import toast while Fresco checks whether the same protocol or media files were already imported.',
  },

  validating: {
    id: 'fresco.ImportToastContent.validating',
    defaultMessage: 'Validating...',
    description:
      'Progress step shown in the protocol import toast while the protocol is checked for errors.',
  },

  parsing: {
    id: 'fresco.ImportToastContent.parsing',
    defaultMessage: 'Reading file...',
    description:
      'First progress step shown in the protocol import toast while the chosen protocol file is opened and read.',
  },
});

type PhaseConfig = {
  label: MessageDescriptor;
  icon: React.ElementType;
};

const phaseConfig: Record<ImportPhase, PhaseConfig> = {
  'parsing': { label: messages.parsing, icon: FileSearch },
  'validating': { label: messages.validating, icon: ShieldCheck },
  'checking-duplicates': { label: messages.duplicates, icon: Search },
  'extracting-assets': { label: messages.extracting, icon: Package },
  'uploading-protocol': { label: messages.uploadingProtocol, icon: FileUp },
  'uploading-assets': { label: messages.uploadingAssets, icon: Upload },
  'saving': { label: messages.saving, icon: Database },
  'complete': { label: messages.complete, icon: Database },
  'error': { label: messages.failed, icon: Database },
};

type ImportToastContentProps = {
  phase: ImportPhase;
  progress: number;
  error?: string | null;
  onRetry?: () => void;
};

export default function ImportToastContent({
  phase,
  progress,
  error,
  onRetry,
}: ImportToastContentProps) {
  const intl = useAppIntl();

  const config = phaseConfig[phase];
  const Icon = config.icon;

  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-destructive-contrast/80 text-sm">
          {error && <AppErrorMessage error={error} />}
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            className={cx(
              'bg-destructive-contrast/10 hover:bg-destructive-contrast/20',
              'flex w-fit items-center gap-1.5 rounded px-2 py-1 text-xs font-medium',
              'transition-colors',
            )}
          >
            <RefreshCw className="size-3" />
            {intl.formatMessage(commonMessages.retry)}
          </button>
        )}
      </div>
    );
  }

  if (phase === 'complete') {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-sm">
        <Icon className="size-3.5 animate-pulse" />
        <span>{intl.formatMessage(config.label)}</span>
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar
          percentProgress={progress}
          orientation="horizontal"
          nudge={false}
        />
        <span className="text-xs tabular-nums">
          {intl.formatNumber(progress / 100, {
            style: 'percent',
            maximumFractionDigits: 0,
          })}
        </span>
      </div>
    </div>
  );
}
