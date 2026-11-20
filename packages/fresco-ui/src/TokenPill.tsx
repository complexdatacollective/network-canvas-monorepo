'use client';

import type { DOMOutputSpec } from '@tiptap/pm/model';
import { Split, Syringe, TriangleAlert } from 'lucide-react';
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
  /** Whether the pill is a value or a piece of logic; a value when absent. */
  variant?: TokenPillVariant;
};

/**
 * The classes of a pill, for a pill built outside React: the editor draws the
 * placeholders it holds as DOM it builds itself. Outlines the pill while it is
 * `selected`, or while the editor marks it as the selected node.
 */
/**
 * What a pill stands for: a `value` filled in later, or `logic`, a piece of
 * text that reads differently by case. Logic is drawn in a colour and with an
 * icon of its own, so it can be told from a value in a line of pills. A
 * `missing` pill is a value the text names that nothing supplies: it is drawn
 * as a problem, and its label should say so in words.
 */
export type TokenPillVariant = 'value' | 'logic' | 'missing';

const variantClasses: Record<TokenPillVariant, string> = {
  value:
    'border-primary/40 bg-primary/10 data-selected:outline-primary [&.ProseMirror-selectednode]:outline-primary',
  logic:
    'border-info/50 bg-info/10 data-selected:outline-info [&.ProseMirror-selectednode]:outline-info',
  missing:
    // Filled, with the outline set off from it, so the words keep their
    // contrast and a selected pill still shows its outline.
    'border-destructive bg-destructive text-destructive-contrast data-selected:outline-offset-2 data-selected:outline-destructive [&.ProseMirror-selectednode]:outline-offset-2 [&.ProseMirror-selectednode]:outline-destructive',
};

const variantIcons = {
  value: Syringe,
  logic: Split,
  missing: TriangleAlert,
} satisfies Record<TokenPillVariant, typeof Syringe>;

export const tokenPillClasses = (
  className?: string,
  variant: TokenPillVariant = 'value',
) =>
  cx(
    // A long label wraps like the words around it, each line drawn as the
    // pill, so a narrow column or table cell is never pushed wider.
    'mx-0.5 rounded-full border box-decoration-clone px-2 py-px',
    // The value's name in bold body type, whatever the text around it is set
    // in, so a pill in a bold label or a heading reads as it does in the
    // editor.
    'font-body font-bold data-selected:outline-2 [&.ProseMirror-selectednode]:outline-2',
    variantClasses[variant],
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
 * An icon a pill opens with, as DOM the editor builds itself: lucide's own
 * drawing of it, attribute for attribute. Hidden from screen readers; the
 * pill's words name it.
 */
const iconSpec = (name: string, paths: readonly string[]): DOMOutputSpec => [
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
    'class': `lucide lucide-${name} ${tokenPillIconClasses}`,
  },
  ...paths.map((d): DOMOutputSpec => [`${SVG} path`, { d }]),
];

/** Lucide's `Syringe`: a value injected into the text. */
const tokenPillIconSpec = iconSpec('syringe', [
  'm18 2 4 4',
  'm17 7 3-3',
  'M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5',
  'm9 11 4 4',
  'm5 19-3 3',
  'm14 4 6 6',
]);

/** Lucide's `TriangleAlert`, for a value the text names that is missing. */
const missingIconSpec = iconSpec('triangle-alert', [
  'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
  'M12 9v4',
  'M12 17h.01',
]);

/**
 * A pill's contents as DOM the editor builds itself, as `TokenPill` draws
 * them: the icon and the label's first word held together, then the rest of
 * the label.
 */
export const tokenPillContentSpec = (
  label: TokenPillLabel,
  missing = false,
): (DOMOutputSpec | string)[] => {
  const [first, rest] = splitFirstWord(presentationalTextValue(label));
  return [
    [
      'span',
      { class: tokenPillLeadClasses },
      missing ? missingIconSpec : tokenPillIconSpec,
      first,
    ],
    ...(rest === '' ? [] : [rest]),
  ];
};

/**
 * A pill's contents: the icon and the label's first word held together, then
 * the rest of the label. For a pill drawn by an element of its own, such as
 * one that is also a button.
 */
export const TokenPillContent = ({
  label,
  variant = 'value',
}: {
  label: TokenPillLabel;
  variant?: TokenPillVariant;
}) => {
  const [first, rest] = splitFirstWord(presentationalTextValue(label));
  const Icon = variantIcons[variant];
  return (
    <>
      <span className={tokenPillLeadClasses}>
        <Icon aria-hidden className={tokenPillIconClasses} />
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
  variant = 'value',
  className,
  ...props
}: TokenPillProps) => {
  const language = useTokenPillLanguage(label);
  return (
    <span
      {...props}
      {...language}
      data-token={token}
      data-variant={variant === 'value' ? undefined : variant}
      data-selected={selected || undefined}
      className={tokenPillClasses(className, variant)}
    >
      <TokenPillContent label={label} variant={variant} />
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
