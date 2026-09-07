'use client';
import { Database, FileSearch, FileUp, Package, X } from 'lucide-react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { exportStageMessages } from '@codaco/network-exporters/messages';

const messages = defineMessages({
  progressCount: {
    id: 'fresco.export.progressCount',
    defaultMessage: '{current, number} / {total, number}',
    description: 'Current and total number of interviews in a running export.',
  },
});

type ExportStage = 'fetching' | 'formatting' | 'generating' | 'outputting';

const stageConfig: Record<
  ExportStage,
  { label: MessageDescriptor; icon: React.ElementType }
> = {
  fetching: { label: exportStageMessages.fetching, icon: FileSearch },
  formatting: { label: exportStageMessages.formatting, icon: Package },
  generating: { label: exportStageMessages.generating, icon: Database },
  outputting: { label: exportStageMessages.outputting, icon: FileUp },
};

type ExportToastContentProps = {
  stage: ExportStage;
  progress: number;
  current?: number;
  total?: number;
  onCancel: () => void;
};

export default function ExportToastContent({
  stage,
  progress,
  current,
  total,
  onCancel,
}: ExportToastContentProps) {
  const intl = useAppIntl();

  const config = stageConfig[stage];
  const Icon = config.icon;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-sm">
        <Icon className="size-3.5 animate-pulse" />
        <span>{intl.formatMessage(config.label)}</span>
        {total ? (
          <span className="text-xs tabular-nums opacity-70">
            {intl.formatMessage(messages.progressCount, {
              current: current ?? 0,
              total,
            })}
          </span>
        ) : null}
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
      <Button
        onClick={onCancel}
        color="dynamic"
        icon={<X aria-hidden />}
        size="sm"
        className="mb-1 w-fit"
      >
        {intl.formatMessage(commonMessages.cancel)}
      </Button>
    </div>
  );
}
