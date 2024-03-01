import { Heading } from '@acme/ui';

export default function Article({
  content,
  title,
}: {
  content: JSX.Element;
  title: string;
}) {
  return (
    <article className="max-w-[75ch] flex-1">
      <header>
        <Heading variant="h4-all-caps" margin='none'>Section Name</Heading>
        <Heading variant="h1" margin='none' className='!mb-8'>{title}</Heading>
      </header>
      {content}
    </article>
  );
}
