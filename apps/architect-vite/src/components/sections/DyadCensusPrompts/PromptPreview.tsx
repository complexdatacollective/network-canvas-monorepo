import { Markdown } from "~/components/Form/Fields";

interface PromptPreviewProps {
	text: string;
}

const PromptPreview = ({ text }: PromptPreviewProps) => <Markdown label={text} />;

export default PromptPreview;
