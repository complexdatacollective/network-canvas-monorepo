'use client';

import * as React from 'react';

import { DeferredFieldLabelMarkdown } from '../DeferredMarkdown';
import { Label as UILabel } from '../Label';

/**
 * Hack for `>` characters that already exist in some protocols
 * and will be interpreted as block quotes on first load
 * Encoding this way forces slate to treat them as paragraphs.
 *
 * This was implemented as two successive 'replace' operations
 * rather than a single regex, because Safari does not support
 * lookbehind.
 */
const escapeAngleBracket = (value = '') =>
  value.replace(/>/g, '&gt;').replace(/<br&gt;/g, '<br>');

type FieldLabelProps = React.ComponentPropsWithoutRef<typeof UILabel> & {
  required?: boolean;
};

const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ required, children, ...props }, ref) => {
    const processedChildren = React.useMemo(() => {
      if (typeof children === 'string') {
        return escapeAngleBracket(children);
      }
      return children;
    }, [children]);

    return (
      <UILabel ref={ref} {...props}>
        {typeof processedChildren === 'string' ? (
          <DeferredFieldLabelMarkdown>
            {processedChildren}
          </DeferredFieldLabelMarkdown>
        ) : (
          processedChildren
        )}
        {required && (
          <span className="text-destructive-ink" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </UILabel>
    );
  },
);

FieldLabel.displayName = 'FieldLabel';

export { FieldLabel };
