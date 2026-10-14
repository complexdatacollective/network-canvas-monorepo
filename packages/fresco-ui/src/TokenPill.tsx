import type { DOMOutputSpec } from '@tiptap/pm/model';
import { Database } from 'lucide-react';
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
const tokenPillIconClasses =
  'me-1 inline-block size-[1em] align-[-0.125em] opacity-70';

/**
 * Holds the icon and the label's first word together, so the icon is never
 * left at the end of one line while the label starts on the next. The rest of
 * a long label still wraps as words do.
 */
const tokenPillLeadClasses = 'whitespace-nowrap';

/** A label split after its first word: `['partner', ' of (x)']`. */
const splitFirstWord = (label: string): readonly [string, string] => {
  const first = /^\s*\S*/.exec(label)?.[0] ?? '';
  return [first, label.slice(first.length)];
};

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The icon a pill opens with, lucide's `Database` (a recorded value), as DOM
 * the editor builds itself: lucide's own drawing of it, attribute for
 * attribute. Hidden from screen readers; the pill's words name it.
 */
const tokenPillIconSpec: DOMOutputSpec = [
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
    'class': `lucide lucide-database ${tokenPillIconClasses}`,
  },
  [`${SVG} ellipse`, { cx: '12', cy: '5', rx: '9', ry: '3' }],
  [`${SVG} path`, { d: 'M3 5V19A9 3 0 0 0 21 19V5' }],
  [`${SVG} path`, { d: 'M3 12A9 3 0 0 0 21 12' }],
];

/**
 * A pill's contents as DOM the editor builds itself, as `TokenPill` draws
 * them: the icon and the label's first word held together, then the rest of
 * the label.
 */
export const tokenPillContentSpec = (
  label: string,
): (DOMOutputSpec | string)[] => {
  const [first, rest] = splitFirstWord(label);
  return [
    ['span', { class: tokenPillLeadClasses }, tokenPillIconSpec, first],
    ...(rest === '' ? [] : [rest]),
  ];
};

/**
 * A pill's contents: the icon and the label's first word held together, then
 * the rest of the label. For a pill drawn by an element of its own, such as
 * one that is also a button.
 */
export const TokenPillContent = ({ label }: { label: string }) => {
  const [first, rest] = splitFirstWord(label);
  return (
    <>
      <span className={tokenPillLeadClasses}>
        <Database aria-hidden className={tokenPillIconClasses} />
        {first}
      </span>
      {rest}
    </>
  );
};

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
    <TokenPillContent label={label} />
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
