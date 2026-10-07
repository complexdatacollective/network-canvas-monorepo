import type React from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { cx } from '~/utils/cva';

type PageHeadingProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Spans the page, for a page whose content does, instead of the reading column. */
  fullWidth?: boolean;
};

// The title is always an `<h1>`, whatever it is made of. It is the page's only
// top-level heading and RouteFocus's landing point, so a caller passing a node
// instead of a string must not be able to leave the route without one.
const PageHeading = ({
  title,
  description,
  actions,
  fullWidth = false,
}: PageHeadingProps) => (
  <div className="w-full">
    <div
      className={cx('mx-auto flex w-full flex-col', !fullWidth && 'max-w-4xl')}
    >
      <div className="flex items-center justify-between gap-5">
        <Heading level="h1" {...routeFocusTargetProps}>
          {title}
        </Heading>
        {actions ? <div className="flex shrink-0 gap-5">{actions}</div> : null}
      </div>
      {description ? (
        <Paragraph intent="lead" emphasis="muted" margin="none">
          {description}
        </Paragraph>
      ) : null}
    </div>
  </div>
);

export default PageHeading;
