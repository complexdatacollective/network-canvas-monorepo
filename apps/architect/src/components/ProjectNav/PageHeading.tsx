import type React from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

type PageHeadingProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

const PageHeading = ({ title, description, actions }: PageHeadingProps) => (
  <div className="w-full">
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <div className="flex items-center justify-between gap-5">
        {typeof title === 'string' ? (
          <Heading level="h1">{title}</Heading>
        ) : (
          title
        )}
        {actions ? <div className="flex shrink-0 gap-5">{actions}</div> : null}
      </div>
      {description ? (
        <Paragraph intent="lead" margin="none" className="text-muted">
          {description}
        </Paragraph>
      ) : null}
    </div>
  </div>
);

export default PageHeading;
