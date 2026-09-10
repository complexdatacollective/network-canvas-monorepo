import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { NodeColorReference } from '@codaco/protocol-validation';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';
const chromeMessages = defineMessages({
  unnamedDisease: {
    id: 'architect.chrome.sections.narrativePedigree.diseasePreview.unnamedDisease',
    defaultMessage: 'Unnamed disease',
    description:
      'Visible text in components / sections / NarrativePedigree / DiseasePreview.',
  },
});

type DiseasePreviewProps = {
  label?: string;
  color?: NodeColorReference;
};

const DiseasePreview = ({ label, color }: DiseasePreviewProps) => {
  const intl = useAppIntl();
  return (
    <div className="flex items-center gap-2.5 py-2.5">
      {color && (
        <span
          className="inline-block size-4 shrink-0 rounded-full"
          style={{ background: resolveProtocolColor(color) }}
          aria-hidden="true"
        />
      )}
      <span>{label ?? intl.formatMessage(chromeMessages.unnamedDisease)}</span>
    </div>
  );
};

export default DiseasePreview;
