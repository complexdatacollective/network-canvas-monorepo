import type { ReactNode } from 'react';

import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

/**
 * The centred title and lead paragraphs that open a content page. It is also
 * where the header's skip link lands.
 */
export function PageIntro({
  heading,
  paragraphs,
}: {
  heading: string;
  paragraphs: readonly ReactNode[];
}) {
  return (
    <div
      id={SITE_NAVIGATION_SKIP_TARGET_ID}
      className="tablet-portrait:pt-24 mx-auto max-w-4xl px-6 pt-16 text-center"
    >
      <Heading
        level="h1"
        variant="display-heading"
        margin="none"
        className="text-text"
      >
        {heading}
      </Heading>
      <div className="mt-6 flex flex-col gap-3">
        {paragraphs.map((paragraph, index) => (
          <Paragraph
            key={index}
            intent="lead"
            margin="none"
            className="text-text/75 text-pretty"
          >
            {paragraph}
          </Paragraph>
        ))}
      </div>
    </div>
  );
}
