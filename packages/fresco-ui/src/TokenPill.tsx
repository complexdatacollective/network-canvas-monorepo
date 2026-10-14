import type { DOMOutputSpec } from '@tiptap/pm/model';
import { Variable } from 'lucide-react';
import { type ComponentPropsWithoutRef, Fragment } from 'react';

import { cx } from './utils/cva';

type TokenPillProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** What the text records for the placeholder, such as `name`. */
  token: string;
  /** What the pill says: the placeholder's name, such as “Name”. */
  label: string;
  /** Outlines the pill, as the editor does while its caret is on it. */
  selected?: boolean;
};

/**
 * The classes of a pill, for a pill built outside React: the editor draws the
 * placeholders it holds as DOM it builds itself. Outlines the pill while it is
 * `selected`, or while the editor marks it as the selected node.
 */
export const tokenPillClasses = (className?: string) =>
  cx(
    // A long label wraps like the words around it, each line drawn as the
    // pill, so a narrow column or table cell is never pushed wider.
    'mx-0.5 rounded-full border box-decoration-clone px-2 py-px',
    'border-primary/40 bg-primary/10 font-semibold',
    'data-selected:outline-primary data-selected:outline-2',
    '[&.ProseMirror-selectednode]:outline-primary [&.ProseMirror-selectednode]:outline-2',
    className,
  );

/** The classes of the icon a pill opens with, before its label. */
export const tokenPillIconClasses =
  'me-1 inline-block size-[1em] align-[-0.125em] opacity-70';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The icon a pill opens with, lucide's `Variable` (a data value), as DOM
 * the editor builds itself: lucide's own drawing of it, attribute for
 * attribute. Hidden from screen readers; the pill's words name it.
 */
export const tokenPillIconSpec: DOMOutputSpec = [
  `${SVG} svg`,
  {
    'xmlns': SVG,
    'viewBox': '0 0 24 24',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    'class': `lucide lucide-variable ${tokenPillIconClasses}`,
  },
  [`${SVG} path`, { d: 'M8 21s-4-3-4-9 4-9 4-9' }],
  [`${SVG} path`, { d: 'M16 3s4 3 4 9-4 9-4 9' }],
  [`${SVG} line`, { x1: '15', x2: '9', y1: '9', y2: '15' }],
  [`${SVG} line`, { x1: '9', x2: '15', y1: '9', y2: '15' }],
];

/**
 * A placeholder inside text, such as a person's name that is filled in later,
 * drawn as a pill. The rich text editor draws every placeholder it holds with
 * it, and `TokenizedText` draws them in text that is only read, so a
 * placeholder looks the same in both. Its words are its label, so a screen
 * reader reads it as part of the sentence.
 */
export const TokenPill = ({
  token,
  label,
  selected = false,
  className,
  ...props
}: TokenPillProps) => (
  <span
    {...props}
    data-token={token}
    data-selected={selected || undefined}
    className={tokenPillClasses(className)}
  >
    <Variable aria-hidden className={tokenPillIconClasses} />
    {label}
  </span>
);

/** A run of text, or a placeholder in it, named by what the text records. */
export type TokenizedTextPart = string | Readonly<{ token: string }>;

/**
 * Text that holds placeholders, read-only: its words as they are, and each
 * placeholder as the pill the editor shows for it. `tokens` names every
 * placeholder the text may hold; one it does not name shows as its recorded
 * name.
 */
export const TokenizedText = ({
  parts,
  tokens,
}: {
  parts: readonly TokenizedTextPart[];
  tokens: readonly Readonly<{ id: string; label: string }>[];
}) => (
  <>
    {parts.map((part, index) =>
      typeof part === 'string' ? (
        <Fragment key={index}>{part}</Fragment>
      ) : (
        <TokenPill
          key={index}
          token={part.token}
          label={
            tokens.find(({ id }) => id === part.token)?.label ?? part.token
          }
        />
      ),
    )}
  </>
);
