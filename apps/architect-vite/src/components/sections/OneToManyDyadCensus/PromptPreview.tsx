import { Markdown } from "~/lib/legacy-ui/components/Fields";

type PromptPreviewProps = {
	text: string;
};

const PromptPreview = ({ text }: PromptPreviewProps) => <Markdown label={text} />;

export default PromptPreview;
