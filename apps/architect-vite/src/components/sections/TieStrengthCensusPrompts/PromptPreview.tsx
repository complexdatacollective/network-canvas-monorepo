import { Markdown } from "@codaco/legacy-ui/components/Fields";

type PromptPreviewProps = {
	text: string;
};

const PromptPreview = ({ text }: PromptPreviewProps) => <Markdown label={text} />;

export default PromptPreview;
