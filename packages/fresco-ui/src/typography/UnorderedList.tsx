import { cva, cx } from '../utils/cva';

/**
 * A list's markers, its indent, and the space below it unless it is the last
 * thing in its container: how the interview draws a list (`RenderMarkdown`),
 * and how the rich text editor draws one, so that a list is spaced the same
 * in both.
 */
export const listVariants = cva({
  base: 'not-last:mb-[1em]',
  variants: {
    kind: {
      bullet: 'list-disc',
      ordered: 'list-decimal',
    },
    /**
     * Where the room for the markers is: outside the list (`margin`), or
     * inside it (`padding`), for a list whose own box has to take in its
     * markers, such as one the editor draws a frame round. Both look the
     * same.
     */
    indent: {
      margin: 'ms-8',
      padding: 'ps-8',
    },
  },
  defaultVariants: { kind: 'bullet', indent: 'margin' },
});

export function UnorderedList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul className={cx(listVariants({ kind: 'bullet' }), className)}>
      {children}
    </ul>
  );
}

export function OrderedList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ol className={cx(listVariants({ kind: 'ordered' }), className)}>
      {children}
    </ol>
  );
}
