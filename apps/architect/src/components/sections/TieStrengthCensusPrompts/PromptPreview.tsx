import Markdown from '~/components/Markdown';

type PromptPreviewProps = {
  text: string;
};

const PromptPreview = ({ text }: PromptPreviewProps) => (
  <Markdown label={text} />
);

export default PromptPreview;
