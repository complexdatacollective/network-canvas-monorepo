import type { ReactNode } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import { isVariableType } from '../rules/operators.ts';

/**
 * One attribute, drawn as its name beside the colour and mark of the kind of
 * value it holds.
 *
 * The one pill for an attribute everywhere the builder shows one: the
 * attribute pickers, the corner of a form's field block, rule summaries,
 * Architect's codebook, and inline in researcher text, where it stands for the
 * value the interview shows. The kind decides what can be asked about an
 * attribute and what a rule can compare it against, so a list of three dozen
 * attributes is unreadable without it.
 *
 * Two renderers share one class builder: `VariablePill` for React, and
 * `variablePillSpec` for ProseMirror, whose inline node draws a DOM
 * specification rather than a React tree (fresco-ui's editor takes the
 * specification from its consumer, because the mapping from a kind of value
 * to a colour and a mark is protocol vocabulary that fresco-ui does not know).
 *
 * The mark is decorative. Where the pill renders inside a `role="option"`, the
 * row's accessible name has to be the attribute's own name, so the kind is
 * said in words by whoever renders the pill (the picker describes each row
 * with it), or, where nothing else says it, by `describeKind`.
 */
export type VariablePillKind = VariableType | 'dynamic' | 'placeholder';

/**
 * `inline` sits in a line of text and keeps its baseline; `sm` is for a field
 * block's corner and rule summaries; `md` for the pickers; `lg` for
 * Architect's codebook and printable summary.
 */
export type VariablePillSize = 'inline' | 'sm' | 'md' | 'lg';

export type VariablePillProps = Readonly<{
  /**
   * What the pill shows: the attribute's name (never translated), a dynamic
   * attribute's values ("their / her / his", see `dynamicAttributePillName`),
   * or the name of an interview value such as "Today’s date".
   */
  name: string;
  /**
   * The kind of value. Absent for a row that stands for something other than
   * an attribute (a create sentinel, "Choose an attribute"), which takes the
   * neutral charcoal accent and a question mark, neither of which claims a
   * kind.
   */
  kind?: VariablePillKind;
  /**
   * Whether the codebook no longer describes this attribute. A reference that
   * still names one has to be read back (the researcher cannot repair what the
   * editor will not show), so the pill is drawn in the destructive accent:
   * not knowing the kind and the attribute being gone are different facts,
   * and only the second is something to fix.
   */
  missing?: boolean;
  /** Defaults to `lg`. */
  size?: VariablePillSize;
  /**
   * A dashed outline with no fill, for a field block whose attribute has not
   * been chosen yet.
   */
  dashed?: boolean;
  /**
   * Adds a visually hidden statement of the kind, in English, for screen
   * readers, where nothing else says it (an inline pill in text). Leave it off
   * where the pill names a list row: that row's name has to be the attribute's
   * own name.
   */
  describeKind?: boolean;
  /**
   * The language of the name, for a name in the interface's own words (an
   * interview value such as "Today’s date", a placeholder of wording that
   * Network Canvas supplies). Absent for a name someone wrote, such as an
   * attribute's, which has no language the editor knows.
   */
  lang?: string;
  /** The direction of the name; by default, its own (`auto`). */
  dir?: 'ltr' | 'rtl' | 'auto';
  className?: string;
}>;

/**
 * Where each mark is served from.
 *
 * `new URL(specifier, import.meta.url)` rather than an `import` of the file,
 * because this package's source is compiled inside each consumer's own
 * program: an `import` of a `.svg` needs an ambient module declaration that
 * the consumer's TypeScript program would have to supply, while this form is
 * a plain string expression that every bundler in the workspace rewrites.
 */
const ICON_URLS = {
  boolean: new URL('./icons/boolean-variable.svg', import.meta.url).href,
  categorical: new URL('./icons/categorical-variable.svg', import.meta.url)
    .href,
  datetime: new URL('./icons/date-variable.svg', import.meta.url).href,
  layout: new URL('./icons/layout-variable.svg', import.meta.url).href,
  location: new URL('./icons/location-variable.svg', import.meta.url).href,
  number: new URL('./icons/number-variable.svg', import.meta.url).href,
  ordinal: new URL('./icons/ordinal-variable.svg', import.meta.url).href,
  scalar: new URL('./icons/scalar-variable.svg', import.meta.url).href,
  text: new URL('./icons/text-variable.svg', import.meta.url).href,
  dynamic: new URL('./icons/dynamic-variable.svg', import.meta.url).href,
  placeholder: new URL('./icons/placeholder-variable.svg', import.meta.url)
    .href,
} as const satisfies Record<VariablePillKind, string>;

const DEFAULT_ICON_URL = new URL(
  './icons/default-variable.svg',
  import.meta.url,
).href;

/**
 * The accent of each kind, set once as a custom property on the root and read
 * by both the ring around the pill and the panel behind its mark. Written as
 * whole class strings so that the stylesheet contains every one of them.
 */
const ACCENT_CLASSES = {
  boolean: '[--variable-pill-accent:oklch(var(--neon-carrot))]',
  categorical: '[--variable-pill-accent:oklch(var(--mustard))]',
  datetime: '[--variable-pill-accent:oklch(var(--tomato))]',
  layout: '[--variable-pill-accent:oklch(var(--purple-pizazz))]',
  location: '[--variable-pill-accent:oklch(var(--slate-blue--dark))]',
  number: '[--variable-pill-accent:oklch(var(--paradise-pink))]',
  ordinal: '[--variable-pill-accent:oklch(var(--sea-green))]',
  scalar: '[--variable-pill-accent:oklch(var(--kiwi))]',
  text: '[--variable-pill-accent:oklch(var(--cerulean-blue))]',
  dynamic: '[--variable-pill-accent:oklch(var(--navy-taupe))]',
  placeholder: '[--variable-pill-accent:oklch(var(--sea-serpent))]',
} as const satisfies Record<VariablePillKind, string>;

const NEUTRAL_ACCENT_CLASS = '[--variable-pill-accent:oklch(var(--charcoal))]';
const MISSING_ACCENT_CLASS = '[--variable-pill-accent:var(--destructive)]';

/**
 * The kind of a stored type, for a caller that holds the type as a plain
 * string (Architect's codebook): one of the protocol's types, or nothing.
 */
export const variablePillKindOf = (
  type: string | undefined,
): VariableType | undefined => (isVariableType(type) ? type : undefined);

/**
 * English names of the kinds, for screen-reader text, which stays English in
 * every language. Written out rather than read from the codebook editor's
 * message descriptors: an app build compiles a descriptor's `defaultMessage`
 * to an AST, so reading it there yields no string. The attribute types match
 * the English of `codebook/variableTypeLabels.ts`.
 */
const ENGLISH_KIND_NAMES = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  ordinal: 'Ordinal',
  categorical: 'Categorical',
  scalar: 'Scalar',
  datetime: 'Date',
  layout: 'Layout',
  location: 'Location',
  dynamic: 'Dynamic',
  placeholder: 'Placeholder',
} as const satisfies Record<VariablePillKind, string>;

/** The English name of a kind, for screen-reader text. */
export const variableKindEnglishName = (kind: VariablePillKind): string =>
  ENGLISH_KIND_NAMES[kind];

/**
 * The kind of value a pill stands for, said in English for a screen reader
 * after its name: what `describeKind` adds to the name that the pill already
 * shows. Undefined for a pill that claims no kind.
 */
const variablePillKindDescription = ({
  kind,
  missing = false,
}: Pick<VariablePillProps, 'kind' | 'missing'>): string | undefined => {
  if (missing) return '(attribute is no longer in the codebook)';
  if (kind === undefined) return undefined;
  if (kind === 'dynamic') return '(dynamic attribute)';
  if (kind === 'placeholder') return '(value shown during the interview)';
  return `(attribute type: ${ENGLISH_KIND_NAMES[kind]})`;
};

/**
 * The pill said in words, in English, for a screen reader: its name and its
 * kind, for a caller that labels the pill itself (a rule summary).
 */
export const variablePillDescription = ({
  name,
  kind,
  missing = false,
}: Pick<VariablePillProps, 'name' | 'kind' | 'missing'>): string => {
  const described = variablePillKindDescription({ kind, missing });
  return described === undefined ? name : `${name} ${described}`;
};

type VariablePillClassNames = Readonly<{
  root: string;
  /** The surface behind the mark and the name. */
  body: string;
  mark: string;
  icon: string;
  name: string;
}>;

/**
 * The classes of every part of the pill: the one source for the React pill,
 * the ProseMirror specification, and Architect's editable pill, which draws a
 * button and a name editor with the same parts.
 */
export const variablePillClassNames = ({
  kind,
  missing = false,
  size = 'lg',
  dashed = false,
  className,
  fill = false,
}: Pick<
  VariablePillProps,
  'kind' | 'missing' | 'size' | 'dashed' | 'className'
> & {
  /** The name slot takes the whole width (Architect's name editor). */
  fill?: boolean;
}): VariablePillClassNames => {
  const inline = size === 'inline';
  let accent: string = NEUTRAL_ACCENT_CLASS;
  if (missing) accent = MISSING_ACCENT_CLASS;
  else if (kind !== undefined) accent = ACCENT_CLASSES[kind];

  return {
    root: cx(
      // `variable-pill` is the marker class that same-area cascades and the
      // end-to-end suite key on. `w-max` gives WebKit an explicit
      // max-content basis; `w-fit` collapsed to the ellipsis width in Safari.
      'variable-pill font-monospace inline-flex w-max max-w-full min-w-0 flex-nowrap rounded-full font-normal whitespace-nowrap',
      accent,
      dashed
        ? 'border-2 border-dashed border-current/30'
        : 'bg-(--variable-pill-accent)',
      !dashed && !inline && 'effect-shadow-sm',
      size === 'lg' && 'h-12 p-0.5 text-base',
      size === 'md' && 'h-9 p-0.5 text-base',
      size === 'sm' && 'h-6.5 p-px align-middle text-sm',
      // In a line of text: no height of its own, line-height 1 and the
      // baseline of its name, so the line it sits in keeps its height.
      inline && 'items-baseline p-px align-baseline text-[0.86em] leading-none',
      className,
    ),
    body: cx(
      'min-w-0 overflow-hidden rounded-[inherit]',
      dashed ? 'text-current/70 italic' : 'text-text bg-surface',
      inline ? 'inline-flex items-baseline' : 'grid h-full items-center',
      size === 'lg' && 'grid-cols-[3rem_minmax(0,auto)]',
      size === 'md' && 'grid-cols-[2.25rem_minmax(0,auto)]',
      size === 'sm' && 'grid-cols-[1.5rem_minmax(0,auto)]',
      fill && 'w-full grid-cols-[3rem_minmax(0,1fr)]',
    ),
    mark: cx(
      'flex items-center justify-center self-stretch',
      dashed
        ? 'not-italic'
        : 'border-e border-white/25 bg-(--variable-pill-accent)',
      inline && 'inline-flex w-[1.6em] shrink-0',
    ),
    icon: cx(
      'block opacity-80',
      size === 'lg' && 'w-5',
      size === 'md' && 'w-4',
      size === 'sm' && 'w-3',
      inline && 'size-[0.85em]',
    ),
    name: cx(
      // A name that someone wrote reads in its own direction (`dir="auto"`),
      // on the interface's side of the pill (`text-match-parent`).
      'text-match-parent m-0 min-w-0 overflow-hidden break-keep text-ellipsis whitespace-nowrap',
      size === 'lg' && 'px-6',
      size === 'md' && 'px-4',
      size === 'sm' && 'px-2.5',
      inline && 'px-[0.5em] py-[0.12em]',
    ),
  };
};

const iconUrlFor = (kind: VariablePillKind | undefined) =>
  kind === undefined ? DEFAULT_ICON_URL : ICON_URLS[kind];

/** The mark of a dashed pill: braces, in the text colour. */
const DASHED_MARK = '{ }';

/** What the root says about itself to tests and the end-to-end suite. */
const rootAttributes = ({
  name,
  kind,
  missing,
  size,
}: Pick<VariablePillProps, 'name' | 'kind' | 'missing' | 'size'>) => ({
  'value': name,
  // The pill's own statement of the kind of value that it stands for: an
  // accent is not something a test can assert on without asserting a colour.
  ...(kind === undefined ? {} : { 'data-attribute-type': kind }),
  ...(missing === true ? { 'data-attribute-missing': '' } : {}),
  'data-variable-pill-size': size ?? 'lg',
});

/**
 * The pill's mark and surface, with `children` in the name's place: for a
 * caller that draws the root itself (Architect's editable pill, whose root is
 * a button and whose name editor is an input inside the pill).
 */
export function VariablePillBody({
  kind,
  missing,
  size,
  dashed = false,
  fill,
  children,
}: Pick<VariablePillProps, 'kind' | 'missing' | 'size' | 'dashed'> &
  Readonly<{ fill?: boolean; children: ReactNode }>) {
  const classes = variablePillClassNames({
    kind,
    missing,
    size,
    dashed,
    fill,
  });
  return (
    <span className={classes.body}>
      <span aria-hidden className={classes.mark}>
        {dashed ? (
          DASHED_MARK
        ) : (
          <img className={classes.icon} src={iconUrlFor(kind)} alt="" />
        )}
      </span>
      {children}
    </span>
  );
}

/** One attribute, drawn with React. */
export function VariablePill(props: VariablePillProps) {
  const { name, describeKind = false, lang, dir = 'auto' } = props;
  const classes = variablePillClassNames(props);
  const kindDescription = describeKind
    ? variablePillKindDescription(props)
    : undefined;
  return (
    <data className={classes.root} {...rootAttributes(props)}>
      <VariablePillBody {...props}>
        {/* oxlint-disable-next-line direction/typed-text-matches-parent -- the name class from `variablePillClassNames` contains `text-match-parent` */}
        <span dir={dir} lang={lang} className={classes.name}>
          {name}
        </span>
      </VariablePillBody>
      {kindDescription !== undefined && (
        <span className="sr-only" lang="en">
          {` ${kindDescription}`}
        </span>
      )}
    </data>
  );
}

type DomAttributes = Readonly<Record<string, string>>;
/** An element whose children are text or attribute-only elements. */
type DomElement = readonly [
  tag: string,
  attributes: DomAttributes,
  ...children: (string | readonly [tag: string, attributes: DomAttributes])[],
];

/**
 * A ProseMirror DOM specification (a tag, its attributes, and its children),
 * as deep as the pill is. Structurally a `DOMOutputSpec`, written out here so
 * that this package does not depend on ProseMirror for a type.
 */
type VariablePillDomSpec = readonly [
  tag: string,
  attributes: DomAttributes,
  ...children: (
    | DomElement
    | readonly [tag: string, attributes: DomAttributes, ...DomElement[]]
  )[],
];

/**
 * The same pill as `VariablePill`, as a DOM specification for the rich text
 * editor's inline value node. The same element tree, classes and attributes.
 */
export const variablePillSpec = (
  props: VariablePillProps,
): VariablePillDomSpec => {
  const {
    name,
    kind,
    dashed = false,
    describeKind = false,
    lang,
    dir = 'auto',
  } = props;
  const classes = variablePillClassNames(props);
  const kindDescription = describeKind
    ? variablePillKindDescription(props)
    : undefined;
  const mark: DomElement = [
    'span',
    { 'aria-hidden': 'true', 'class': classes.mark },
    dashed
      ? DASHED_MARK
      : ['img', { class: classes.icon, src: iconUrlFor(kind), alt: '' }],
  ];
  const nameElement: DomElement = [
    'span',
    {
      dir,
      ...(lang !== undefined && { lang }),
      class: classes.name,
    },
    name,
  ];
  const body = ['span', { class: classes.body }, mark, nameElement] as const;
  return [
    'data',
    { class: classes.root, ...rootAttributes(props) },
    body,
    ...(kindDescription === undefined
      ? []
      : [
          [
            'span',
            { class: 'sr-only', lang: 'en' },
            ` ${kindDescription}`,
          ] satisfies DomElement,
        ]),
  ];
};

/**
 * The small accent square with a kind's mark, where a whole pill would be too
 * much: the attribute picker's create row names the type that a new attribute
 * will have with it. Decorative: whoever renders it says the kind in words.
 */
export function VariableKindMark({
  kind,
  className,
}: Readonly<{ kind: VariablePillKind; className?: string }>) {
  return (
    <span
      aria-hidden
      data-variable-kind-mark={kind}
      className={cx(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-sm bg-(--variable-pill-accent)',
        ACCENT_CLASSES[kind],
        className,
      )}
    >
      <img className="w-3 opacity-80" src={ICON_URLS[kind]} alt="" />
    </span>
  );
}

/** How many characters of a dynamic attribute's values a pill shows. */
const DYNAMIC_NAME_LIMIT = 30;

/**
 * What a dynamic attribute's pill shows: its distinct wordings, in branch
 * order, joined by " / " ("their / her / his"), ending in an ellipsis after
 * about 30 characters. Counted in graphemes, so an accented letter or an
 * emoji is never cut in half.
 */
export const dynamicAttributePillName = (
  wordings: readonly string[],
  locale?: string,
): string => {
  const distinct = [
    ...new Set(
      wordings.map((wording) => wording.trim()).filter((w) => w !== ''),
    ),
  ];
  const joined = distinct.join(' / ');
  const graphemes = [
    ...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(joined),
  ].map((part) => part.segment);
  if (graphemes.length <= DYNAMIC_NAME_LIMIT) return joined;
  // Cut where it falls, without a separator left hanging before the ellipsis.
  const cut = graphemes
    .slice(0, DYNAMIC_NAME_LIMIT)
    .join('')
    .replace(/[\s/]+$/u, '');
  return `${cut}…`;
};
