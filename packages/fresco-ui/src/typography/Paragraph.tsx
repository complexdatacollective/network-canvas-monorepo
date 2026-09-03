import { type useRender as UseRender, useRender } from '@base-ui/react';
import * as React from 'react';

import { cva, cx, type VariantProps } from '../utils/cva';

export const paragraphVariants = cva({
  // `wrap-break-word` for the same reason as `Heading`: body copy quotes
  // researcher-authored identifiers, and an unbroken token must break rather
  // than overflow its container (#1392).
  base: 'font-body text-pretty wrap-break-word',
  variants: {
    intent: {
      default: '',
      blockquote: 'mt-4 border-l-2 pl-6 italic',
      inlineCode:
        'bg-background/50 font-monospace relative rounded px-1.5 py-0.5 font-semibold',
      lead: 'text-lg',
      smallText: 'text-sm',
      // Compact small text with tight leading: counts, dates, footnotes.
      caption: 'text-xs leading-snug',
      // Monospace caption for identifiers and attribution: filenames,
      // author lists, generated timestamps.
      meta: 'font-monospace text-xs leading-snug',
    },
    emphasis: {
      default: 'opacity-100',
      muted: 'text-current/70',
    },
    margin: {
      default: 'not-last:mb-[1em]',
      none: 'mt-0',
    },
  },
  defaultVariants: {
    intent: 'default',
    margin: 'default',
    emphasis: 'default',
  },
});

type ParagraphProps = {
  intent?: VariantProps<typeof paragraphVariants>['intent'];
  margin?: VariantProps<typeof paragraphVariants>['margin'];
  emphasis?: VariantProps<typeof paragraphVariants>['emphasis'];
  render?: UseRender.RenderProp;
  /**
   * @deprecated Never had an effect. Use `render` to substitute the element.
   * Kept so existing callers keep type-checking; dropped in the next major.
   */
  asChild?: boolean;
} & React.HTMLAttributes<HTMLParagraphElement>;

const Paragraph = React.forwardRef<HTMLParagraphElement, ParagraphProps>(
  (
    {
      className,
      intent,
      margin,
      emphasis,
      render,
      asChild: _asChild,
      ...props
    },
    ref,
  ) => {
    return useRender({
      render,
      ref,
      props: {
        className: cx(
          paragraphVariants({ intent, margin, emphasis, className }),
        ),
        ...props,
      },
      defaultTagName: intent === 'inlineCode' ? 'code' : 'p',
    });
  },
);

Paragraph.displayName = 'Paragraph';

export default Paragraph;
