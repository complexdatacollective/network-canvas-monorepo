import { useTranslations } from 'next-intl';

import Surface from '@codaco/fresco-ui/layout/Surface';
import { StageBar } from '@codaco/fresco-ui/stages/StageBar';
import { StageTypeBadge } from '@codaco/fresco-ui/stages/StageTypeBadge';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
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
      <ol className="@container mt-4 space-y-2">
        {stages.map((stage, index) => {
          return (
            <Surface
              as="li"
              key={`${index}-${stage.type}`}
              noContainer
              spacing="xs"
              shadow="xs"
              className="grid grid-cols-[2ch_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 text-xs @lg:grid-cols-[2ch_auto_minmax(0,1fr)_auto]"
            >
              <span className="font-monospace text-text/50">
                {String(index + 1).padStart(2, '0')}
              </span>
              <StageTypeBadge type={stage.type} size="sm" />
              {/* Narrow rails cannot fit the label beside a nowrap type name, so
                the two stack until the row is wide enough for both. */}
              <div className="flex min-w-0 flex-col @lg:contents">
                <Paragraph
                  intent="smallText"
                  margin="none"
                  render={<span />}
                  className="min-w-0"
                >
                  {stage.label}
                </Paragraph>
                <Eyebrow
                  tone="subtle"
                  render={<span />}
                  className="@lg:text-right @lg:whitespace-nowrap"
                >
                  {t(`stageTypes.${stage.type}`)}
                </Eyebrow>
              </div>
            </Surface>
          );
        })}
      </ol>
    </div>
  );
}
