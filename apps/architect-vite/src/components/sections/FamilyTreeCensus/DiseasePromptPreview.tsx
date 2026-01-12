import { truncate } from "es-toolkit/compat";

type DiseasePromptPreviewProps = {
	text?: string;
};

const DiseasePromptPreview = ({ text }: DiseasePromptPreviewProps) => <p>{truncate(text ?? "", { length: 100 })}</p>;

export default DiseasePromptPreview;
