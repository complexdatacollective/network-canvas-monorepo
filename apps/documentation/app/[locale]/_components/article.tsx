import { Heading } from '@acme/ui';

export default function Article({
  content,
  title,
}: {
  content: JSX.Element;
  title: string;
}) {
  return (
    <article className="max-w-[85ch] flex-1">
      <header>
        <Heading variant="h1">{title}</Heading>
      </header>
      {content}
    </article>
  );
}
