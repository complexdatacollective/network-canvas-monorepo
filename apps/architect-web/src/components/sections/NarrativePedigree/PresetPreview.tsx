type PresetPreviewProps = {
  label?: string;
};

const PresetPreview = ({ label }: PresetPreviewProps) => (
  <div className="py-(--space-sm)">{label ?? 'Unnamed preset'}</div>
);

export default PresetPreview;
