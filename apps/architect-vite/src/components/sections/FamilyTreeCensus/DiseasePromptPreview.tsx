import { Markdown } from "~/components/Form/Fields";

type DiseasePromptPreviewProps = {
	text: string;
};

const DiseasePromptPreview = ({ text }: DiseasePromptPreviewProps) => <Markdown label={text} />;

export default DiseasePromptPreview;
