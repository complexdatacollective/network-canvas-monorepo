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
    description: 'Researcher-facing ImportToastContent: Import failed',
  },

  complete: {
    id: 'fresco.ImportToastContent.complete',
    defaultMessage: 'Import complete',
    description: 'Researcher-facing ImportToastContent: Import complete',
  },

  saving: {
    id: 'fresco.ImportToastContent.saving',
    defaultMessage: 'Saving...',
    description: 'Researcher-facing ImportToastContent: Saving...',
  },

  uploadingAssets: {
    id: 'fresco.ImportToastContent.uploadingAssets',
    defaultMessage: 'Uploading assets...',
    description: 'Researcher-facing ImportToastContent: Uploading assets...',
  },

  uploadingProtocol: {
    id: 'fresco.ImportToastContent.uploadingProtocol',
    defaultMessage: 'Uploading protocol...',
    description: 'Researcher-facing ImportToastContent: Uploading protocol...',
  },

  extracting: {
    id: 'fresco.ImportToastContent.extracting',
    defaultMessage: 'Extracting assets...',
    description: 'Researcher-facing ImportToastContent: Extracting assets...',
  },

  duplicates: {
    id: 'fresco.ImportToastContent.duplicates',
    defaultMessage: 'Checking duplicates...',
    description: 'Researcher-facing ImportToastContent: Checking duplicates...',
  },

  validating: {
    id: 'fresco.ImportToastContent.validating',
    defaultMessage: 'Validating...',
    description: 'Researcher-facing ImportToastContent: Validating...',
  },

  parsing: {
    id: 'fresco.ImportToastContent.parsing',
    defaultMessage: 'Reading file...',
    description: 'Researcher-facing ImportToastContent: Reading file...',
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
