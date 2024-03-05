'use client';

import { Heading } from '@acme/ui';
import { usePathname } from '~/navigation';

export default function Article({
  content,
  title,
}: {
  content: JSX.Element;
  title: string;
}) {
  const pathname = usePathname();
  const project = pathname.split('/')[1];
  const section = pathname.split('/')[2];

  return (
    <article className="max-w-[75ch] flex-1">
      <header>
        <Heading variant="h4-all-caps" margin="none" className="text-accent">
          {project} {section && <>&#129046; {section}</>}
        </Heading>
        <Heading variant="h1" margin="none" className="!mb-8">
          {title}
        </Heading>
      </header>
      {content}
    </article>
  );
}
