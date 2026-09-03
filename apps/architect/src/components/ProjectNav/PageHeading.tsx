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
const PageHeading = ({ title, description, actions }: PageHeadingProps) => {
  const heading = (
    <Heading level="h1" {...routeFocusTargetProps}>
      {title}
    </Heading>
  );
  return (
    // Block flow, not a flex column: the title is cap-trimmed, so the space
    // between it and the description is its own bottom margin, and a flex
    // container would take that margin out of the flow. The title only sits
    // in a flex row when there are actions to put beside it.
    <div className="my-6 w-full">
      <div className="mx-auto w-full max-w-4xl">
        {actions ? (
          <div className="flex items-center justify-between gap-5">
            {heading}
            <div className="flex shrink-0 gap-5">{actions}</div>
          </div>
        ) : (
          heading
        )}
        {description ? (
          <Paragraph intent="lead" margin="none" className="text-current/70">
            {description}
          </Paragraph>
        ) : null}
      </div>
    </div>
  );
};

export default PageHeading;
