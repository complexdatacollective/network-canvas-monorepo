'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
import { StageSequence } from '~/components/protocol-gallery/StageSequence';
import type { ProtocolDownload } from '~/lib/protocolGallery';

function waveValue(wave: number): string {
  return `wave-${wave}`;
}

export function StageSequenceRail({
  downloads,
}: {
  downloads: ProtocolDownload[];
}) {
  const t = useTranslations('ProtocolGallery');
  const [firstWave] = downloads;
  const [selected, setSelected] = useState(() =>
    firstWave ? waveValue(firstWave.wave) : '',
  );

  if (!firstWave) return null;
  if (downloads.length === 1) {
    return <StageSequence stages={firstWave.stages} />;
  }

  return (
    <Tabs
      layout="top"
      aria-label={t('stages.waveTabs')}
      value={selected}
      onValueChange={setSelected}
      tabs={downloads.map((download) => ({
        value: waveValue(download.wave),
        label: t('detail.wave', { wave: download.wave }),
      }))}
    >
      {downloads.map((download) => (
        <TabsPanel
          key={download.wave}
          value={waveValue(download.wave)}
          className="pt-2"
        >
          <StageSequence stages={download.stages} />
        </TabsPanel>
      ))}
    </Tabs>
  );
}
