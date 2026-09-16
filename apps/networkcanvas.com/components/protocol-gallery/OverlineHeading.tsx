import type { ComponentProps } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';

type OverlineHeadingProps = Omit<
  ComponentProps<typeof Heading>,
  'level' | 'variant' | 'margin' | 'render'
> &
  (
    | { as?: 'h2' | 'h3' | 'legend'; htmlFor?: never }
    | { as: 'label'; htmlFor: string }
  );

export function OverlineHeading({
  as = 'h2',
  htmlFor,
  ...props
}: OverlineHeadingProps) {
  return (
    <Heading
      level="h4"
      variant="all-caps"
      margin="none"
      render={(renderProps) => {
        if (as === 'label') {
          return <label {...renderProps} htmlFor={htmlFor} />;
        }
        const Tag = as;
        return <Tag {...renderProps} />;
      }}
      {...props}
    />
  );
}
