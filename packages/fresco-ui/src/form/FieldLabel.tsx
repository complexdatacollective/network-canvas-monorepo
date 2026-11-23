'use client';

import * as React from 'react';

import { Label as UILabel } from '../Label';
import { RenderMarkdown } from '../RenderMarkdown';

type FieldLabelProps = React.ComponentPropsWithoutRef<typeof UILabel> & {
  required?: boolean;
};

/** A field's label. A label given as a string is markdown. */
const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ required, children, ...props }, ref) => (
    <UILabel ref={ref} {...props}>
      {typeof children === 'string' ? (
        <RenderMarkdown>{children}</RenderMarkdown>
      ) : (
        children
      )}
      {required && (
        <span className="text-destructive-ink" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </UILabel>
  ),
);

FieldLabel.displayName = 'FieldLabel';

export { FieldLabel };
