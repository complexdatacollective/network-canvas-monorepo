type PresetPreviewProps = {
  label: string;
};

const PresetPreview = ({ label }: PresetPreviewProps) => (
  <div className="py-5">{label}</div>
);

export default PresetPreview;
