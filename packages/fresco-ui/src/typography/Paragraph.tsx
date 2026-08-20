import { forwardRef } from 'react';

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
  asChild?: boolean;
} & React.HTMLAttributes<HTMLParagraphElement>;

const Paragraph = forwardRef<HTMLParagraphElement, ParagraphProps>(
  ({ className, intent, margin, emphasis, ...props }, ref) => {
    const Tag = intent === 'inlineCode' ? 'code' : 'p';

    return (
      <Tag
        ref={ref}
        className={cx(
          paragraphVariants({ intent, margin, emphasis, className }),
        )}
        {...props}
      />
    );
  },
);

Paragraph.displayName = 'Paragraph';

export default Paragraph;
