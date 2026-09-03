import React, { type ReactNode } from 'react';

import { RenderMarkdown } from '../RenderMarkdown';
import { paragraphVariants } from '../typography/Paragraph';

/**
 * A field's hint: a small, muted paragraph in the field's flow. It carries the
 * paragraph style's own bottom margin, so the control after it is spaced by
 * the type scale; the markdown inside it is spaced the same way.
 */
export default function Hint({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      className={paragraphVariants({
        intent: 'smallText',
        emphasis: 'muted',
        className: 'mb-[0.5em]!', // Match the label style's bottom margin.
      })}
    >
      {React.Children.map(children, (child) =>
        typeof child === 'string' ? (
          <RenderMarkdown>{child}</RenderMarkdown>
        ) : (
          child
        ),
      )}
    </div>
  );
}
