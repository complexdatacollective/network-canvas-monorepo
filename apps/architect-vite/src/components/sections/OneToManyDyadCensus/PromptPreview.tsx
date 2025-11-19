import { Markdown } from "~/components/Form/Fields";

type PromptPreviewProps = {
	text: string;
};

const PromptPreview = ({ text }: PromptPreviewProps) => <Markdown value={text} />;

export default PromptPreview;
