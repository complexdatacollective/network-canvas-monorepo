import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

type DiseasePreviewProps = {
  label?: string;
  color?: string;
};

const DiseasePreview = ({ label, color }: DiseasePreviewProps) => (
  <div className="flex items-center gap-2.5 py-2.5">
    {color && (
      <span
        className="inline-block size-4 shrink-0 rounded-full"
        style={{ background: resolveProtocolColor(color) }}
        aria-hidden="true"
      />
    )}
    <span>{label ?? 'Unnamed disease'}</span>
  </div>
);

export default DiseasePreview;
