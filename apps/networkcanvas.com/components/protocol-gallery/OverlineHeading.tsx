import type { ComponentProps } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';

type OverlineHeadingProps = Omit<
  ComponentProps<typeof Heading>,
  'level' | 'variant' | 'margin' | 'render'
> & {
  as?: 'h2' | 'h3' | 'legend';
};

export function OverlineHeading({
  as: Tag = 'h2',
  ...props
}: OverlineHeadingProps) {
  return (
    <Heading
      level="h4"
      variant="all-caps"
      margin="none"
      render={(renderProps) => <Tag {...renderProps} />}
      {...props}
    />
  );
}
