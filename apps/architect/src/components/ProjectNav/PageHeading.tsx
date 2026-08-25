import type React from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { routeFocusTargetProps } from '~/components/RouteFocus';

type PageHeadingProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

// The title is always an `<h1>`, whatever it is made of. It is the page's only
// top-level heading and RouteFocus's landing point, so a caller passing a node
// instead of a string must not be able to leave the route without one.
const PageHeading = ({ title, description, actions }: PageHeadingProps) => (
  <div className="w-full">
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <div className="flex items-center justify-between gap-5">
        <Heading level="h1" {...routeFocusTargetProps}>
          {title}
        </Heading>
        {actions ? <div className="flex shrink-0 gap-5">{actions}</div> : null}
      </div>
      {description ? (
        <Paragraph intent="lead" margin="none" className="text-current/70">
          {description}
        </Paragraph>
      ) : null}
    </div>
  </div>
);

export default PageHeading;
