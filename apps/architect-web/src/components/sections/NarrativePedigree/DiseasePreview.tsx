type DiseasePreviewProps = {
  label?: string;
  color?: string;
};

const DiseasePreview = ({ label, color }: DiseasePreviewProps) => (
  <div className="flex items-center gap-(--space-sm) py-(--space-sm)">
    {color && (
      <span
        className="inline-block size-4 shrink-0 rounded-full"
        style={{ background: `hsl(var(--${color}))` }}
        aria-hidden="true"
      />
    )}
    <span>{label ?? 'Unnamed disease'}</span>
  </div>
);

export default DiseasePreview;
