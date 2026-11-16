'use client';

import type { DOMOutputSpec } from '@tiptap/pm/model';
import { Syringe } from 'lucide-react';
import { type ComponentPropsWithoutRef, Fragment } from 'react';

import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';

import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from './PresentationalText';
import { cx } from './utils/cva';

/**
 * What a pill says. A plain string is the interface's own words (“Today”, “The
 * first person's age”); the object form is text with a language of its own,
 * such as `{ text, dir: 'auto' }` for a name someone wrote (an attribute
 * called “team-b!”), which reads in its own direction rather than the
 * interface's.
 */
export type TokenPillLabel = PresentationalText;

type InterfaceLanguage = Readonly<{ lang: string; dir: 'ltr' | 'rtl' }>;

/**
 * `lang` and `dir` for a pill that says `label`. The interface's words take
 * the interface's language and direction, whatever language the text around
 * the pill is in (a protocol's English text in an Arabic interface), so a
 * screen reader reads them in the right voice and they take the interface's
 * typeface. Text with a language of its own keeps it.
 */
export const tokenPillLanguage = (
  label: TokenPillLabel,
  interfaceLanguage: InterfaceLanguage,
): Readonly<{ lang?: string; dir?: 'ltr' | 'rtl' | 'auto' }> =>
  typeof label === 'string'
    ? interfaceLanguage
    : presentationalTextProps(label);

type TokenPillProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** What the text records for the placeholder, such as `name`. */
  token: string;
  /** What the pill says: the placeholder's name, such as “Name”. */
  label: TokenPillLabel;
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
    // The value's name in bold body type, whatever the text around it is set
    // in, so a pill in a bold label or a heading reads as it does in the
    // editor.
    'border-primary/40 bg-primary/10 font-body font-bold',
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
 * The icon a pill opens with, lucide's `Syringe` (a value injected into the
 * text), as DOM
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
    'class': `lucide lucide-syringe ${tokenPillIconClasses}`,
  },
  [`${SVG} path`, { d: 'm18 2 4 4' }],
  [`${SVG} path`, { d: 'm17 7 3-3' }],
  [
    `${SVG} path`,
    { d: 'M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5' },
  ],
  [`${SVG} path`, { d: 'm9 11 4 4' }],
  [`${SVG} path`, { d: 'm5 19-3 3' }],
  [`${SVG} path`, { d: 'm14 4 6 6' }],
];

/**
 * A pill's contents as DOM the editor builds itself, as `TokenPill` draws
 * them: the icon and the label's first word held together, then the rest of
 * the label.
 */
export const tokenPillContentSpec = (
  label: TokenPillLabel,
): (DOMOutputSpec | string)[] => {
  const [first, rest] = splitFirstWord(presentationalTextValue(label));
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
export const TokenPillContent = ({ label }: { label: TokenPillLabel }) => {
  const [first, rest] = splitFirstWord(presentationalTextValue(label));
  return (
    <>
      <span className={tokenPillLeadClasses}>
        <Syringe aria-hidden className={tokenPillIconClasses} />
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
}: TokenPillProps) => {
  const language = useTokenPillLanguage(label);
  return (
    <span
      {...props}
      {...language}
      data-token={token}
      data-selected={selected || undefined}
      className={tokenPillClasses(className)}
    >
      <TokenPillContent label={label} />
    </span>
  );
};

/**
 * `lang` and `dir` for a pill, or another label drawn inside text in the
 * protocol's language, that says `label`: see `tokenPillLanguage`. Without a
 * label, for the interface's own words.
 */
export const useTokenPillLanguage = (label: TokenPillLabel = '') => {
  const intl = useAppIntl();
  const dir = useAppDirection();
  return tokenPillLanguage(label, { lang: intl.locale, dir });
};

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
  tokens: readonly Readonly<{ id: string; label: TokenPillLabel }>[];
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
            tokens.find(({ id }) => id === part.token)?.label ?? {
              // The name the text records, as it was written.
              text: part.token,
              dir: 'auto',
            }
          }
        />
      ),
    )}
  </>
);
