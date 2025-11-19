type PresetPreviewProps = {
	label: string;
};

const PresetPreview = ({ label }: PresetPreviewProps) => <div className="py-4">{label}</div>;

export default PresetPreview;
