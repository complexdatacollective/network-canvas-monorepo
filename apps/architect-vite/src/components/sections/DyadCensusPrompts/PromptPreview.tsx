import { Markdown } from "@codaco/legacy-ui/components/Fields";

interface PromptPreviewProps {
	text: string;
}

const PromptPreview = ({ text }: PromptPreviewProps) => <Markdown label={text} />;

export default PromptPreview;
