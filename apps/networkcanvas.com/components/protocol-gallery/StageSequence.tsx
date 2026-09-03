import { useTranslations } from 'next-intl';

import Surface from '@codaco/fresco-ui/layout/Surface';
import { StageBar } from '@codaco/fresco-ui/stages/StageBar';
import {
  isStageType,
  stageTypeColorStyle,
} from '@codaco/fresco-ui/stages/stageTypes';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { ProtocolStage } from '~/lib/protocolStages';

export function StageSequence({ stages }: { stages: ProtocolStage[] }) {
  const t = useTranslations('ProtocolGallery');

  return (
    <div>
      <Paragraph margin="none" intent="meta" emphasis="muted">
        {t('stages.count', { count: stages.length })}
      </Paragraph>
      <StageBar stages={stages} className="mt-2" />
      <ol className="mt-4 space-y-2">
        {stages.map((stage, index) => (
          <Surface
            as="li"
            key={`${index}-${stage.type}`}
            noContainer
            spacing="xs"
            shadow="xs"
            className="grid grid-cols-[2ch_auto_minmax(0,1fr)_auto] items-center gap-3 text-xs"
          >
            <span className="font-monospace text-text/50">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: stageTypeColorStyle(stage.type).color }}
            />
            <span className="min-w-0 truncate" title={stage.label}>
              {stage.label}
            </span>
            <span className="font-monospace text-text/60 text-right tracking-widest whitespace-nowrap uppercase">
              {isStageType(stage.type)
                ? t(`stageTypes.${stage.type}`)
                : stage.type}
            </span>
          </Surface>
        ))}
      </ol>
    </div>
  );
}
