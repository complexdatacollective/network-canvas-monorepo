type PresetPreviewProps = {
  label: string;
};

const PresetPreview = ({ label }: PresetPreviewProps) => (
  <div className="py-(--space-md)">{label}</div>
);

export default PresetPreview;
