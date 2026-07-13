'use client';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import WorkInProgress from '~/components/customComponents/WorkInProgress';
import type { HeadingNode } from '~/lib/tableOfContents';
import { usePathname } from '~/navigation';

import FancyHeading from './FancyHeading';
import TableOfContents from './TableOfContents';

export default function Article({
  content,
  headings,
  title,
  showToc,
  wip,
}: {
  content: JSX.Element;
  headings: HeadingNode[];
  title: string;
  showToc: boolean;
  wip?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations('SectionSwitcher');

  // Todo: nextjs has hooks specifically for this: useSelectedLayoutSegment
  const sectionSlug = pathname.split('/')[1];
  const sectionLabel =
    sectionSlug && t.has(`${sectionSlug}.label`)
      ? t(`${sectionSlug}.label`)
      : sectionSlug?.replace(/-/g, ' ');
  const subsection = pathname.split('/')[2]?.replace(/-/g, ' '); // replace hyphens with spaces

  return (
    <>
      <article className="tablet-landscape:mx-8 laptop:mx-10 desktop:mx-20 @container/article mx-4 mb-5 w-full max-w-[75ch] flex-1 overflow-y-hidden">
        <header>
          <Heading
            level="h4"
            variant="all-caps"
            margin="none"
            className="text-accent"
          >
            {sectionLabel} {subsection && <>🠖 {subsection}</>}
          </Heading>
          {/* The title is the last child of <header>, so fresco's
              not-last:mb-[0.5em] never applies — force a bottom margin so the
              title is separated from the content below. !mt-0 keeps the top
              tight to the eyebrow above. */}
          <FancyHeading level="h1" className="mt-0! mb-6">
            {title}
          </FancyHeading>
        </header>
        {wip && <WorkInProgress />}
        {showToc && <TableOfContents headings={headings} />}
        {content}
      </article>
      {showToc && <TableOfContents headings={headings} sideBar />}
    </>
  );
}
