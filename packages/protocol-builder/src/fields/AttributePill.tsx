import type { CSSProperties, ReactNode } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import type { RuleAttributeType } from '../rules/operators.ts';

/**
 * One attribute, shown as the researcher's name for it over the colour and
 * icon of the kind of answer it holds.
 *
 * The kind of answer decides what can be asked about an attribute and what a
 * rule can compare it against, so a picker offering three dozen of them is
 * unreadable without it: a researcher scanning for the rating they authored
 * months ago is looking for an ordinal, and the name alone does not say which
 * names are ordinals.
 *
 * This is Architect's own pill — the shape, the two-track grid, the accent
 * ring around a surface-coloured body, and the nine type icons it has drawn
 * attributes with since its codebook editor was written — so that a researcher
 * moving between Architect's remaining screens and this package's editors
 * reads one vocabulary rather than two dialects of it.
 *
 * In this package rather than in `@codaco/fresco-ui`, even though the colours
 * it uses are shared theme tokens: what is protocol-specific is the MAPPING —
 * `VariableType` is the protocol schema's vocabulary, and fresco-ui neither
 * depends on `@codaco/protocol-validation` nor should start to for a control
 * only protocol authoring has.
 *
 * Purely presentational, and deliberately says nothing to a screen reader
 * about the type: where this renders inside a `role="option"`, that row's
 * accessible NAME has to be the attribute's own name, and content inside it is
 * part of that name. The kind of answer is announced by whoever renders the
 * pill — the attribute picker states it beside the held value and describes
 * each row of its list with it — so this cannot decide for both. That is the one place it
 * parts company with Architect's pill, whose icon carried an `alt` of
 * "<type> attribute".
 */
export type AttributePillProps = Readonly<{
  /** The researcher's own name for the attribute. Never translated. */
  name: string;
  /**
   * The kind of answer it holds, or `'layout'` for a layout of the codebook,
   * which a layout picker and a rule name with the same pill. Absent for a row
   * that stands for something other than a codebook attribute or layout — the
   * form-fields list's create sentinel — which takes Architect's own fallback:
   * the charcoal accent and the question-mark mark.
   */
  type?: RuleAttributeType;
  /**
   * Whether the codebook no longer describes this attribute.
   *
   * A rule that names one still has to read it back — the researcher cannot
   * repair what the editor will not show them — so the pill is drawn, in the
   * destructive accent rather than the neutral one an unknown kind takes: not
   * knowing the kind of answer and the attribute being gone are different
   * facts, and only the second is something to fix. The words for it are the
   * caller's, because the caller knows what it is a missing attribute OF.
   */
  missing?: boolean;
  className?: string;
}>;

/**
 * Where each type's icon is served from.
 *
 * `new URL(specifier, import.meta.url)` rather than an `import` of the file,
 * because this package's source is compiled inside each consumer's own
 * program: an `import` of a `.svg` needs an ambient module declaration the
 * consumer's TypeScript program would have to supply, while this form is a
 * plain string expression every bundler in the workspace already rewrites.
 * The same reason fresco-ui reaches its own assets this way.
 */
const ICON_URLS = {
  boolean: new URL('./icons/boolean-variable.svg', import.meta.url).href,
  categorical: new URL('./icons/categorical-variable.svg', import.meta.url)
    .href,
  datetime: new URL('./icons/date-variable.svg', import.meta.url).href,
  location: new URL('./icons/location-variable.svg', import.meta.url).href,
  number: new URL('./icons/number-variable.svg', import.meta.url).href,
  ordinal: new URL('./icons/ordinal-variable.svg', import.meta.url).href,
  scalar: new URL('./icons/scalar-variable.svg', import.meta.url).href,
  text: new URL('./icons/text-variable.svg', import.meta.url).href,
  layout: new URL('./icons/layout-variable.svg', import.meta.url).href,
} as const satisfies Record<RuleAttributeType, string>;

const DEFAULT_ICON_URL = new URL(
  './icons/default-variable.svg',
  import.meta.url,
).href;

/**
 * The accent each kind of answer is shown in, named as the theme's own raw
 * colour triplet rather than as a utility class: the accent is read twice, by
 * the ring around the pill and by the icon panel inside it, so it is set once
 * as a custom property on the root and referenced from both — which is also
 * how Architect's pill does it. A class assembled from a token at runtime
 * would be a class the stylesheet never contains.
 */
const ACCENT_TOKENS = {
  boolean: '--neon-carrot',
  categorical: '--mustard',
  datetime: '--tomato',
  location: '--slate-blue--dark',
  number: '--paradise-pink',
  ordinal: '--sea-green',
  scalar: '--kiwi',
  text: '--cerulean-blue',
  layout: '--purple-pizazz',
} as const satisfies Record<RuleAttributeType, string>;

/** Architect's fallback for anything that is not one of these. */
const DEFAULT_ACCENT_TOKEN = '--charcoal';

type AttributePillStyle = CSSProperties & {
  '--variable-pill-accent': string;
};

/** The pill's own shape. */
const pillClassName = (className: string | undefined): string =>
  cx(
    // `variable-pill` is Architect's marker class, the hook its own same-area
    // cascades key on (the printable summary scales it, the rule preview zooms
    // it). `w-max` gives WebKit an explicit max-content basis; `w-fit`
    // collapsed to the ellipsis width in Safari instead of measuring the full
    // name.
    'variable-pill font-monospace inline-flex h-12 w-max max-w-full min-w-0 flex-nowrap rounded-full p-0.5 text-base',
    // No cursor of its own: the pill is drawn inside the attribute picker's
    // rows and trigger, and a cursor set here would show over part of a row
    // that takes a click everywhere. Where it stands alone, whoever renders it
    // sets the cursor (the rule preview keeps Architect's arrow).
    'effect-shadow-sm bg-(--variable-pill-accent)',
    className,
  );

/** The accent panel and the name. */
function PillContents({
  iconUrl,
  children,
}: Readonly<{ iconUrl: string; children: ReactNode }>) {
  return (
    /*
      A two-track grid gives WebKit a stable intrinsic width: the icon track
      is fixed, while the name contributes its max-content width and may
      still shrink to zero when the pill reaches its container or its max.
    */
    <span className="text-text bg-surface grid h-full min-w-0 grid-cols-[3rem_minmax(0,auto)] overflow-hidden rounded-[inherit]">
      <span className="flex items-center justify-center border-e border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
        <img className="icon opacity-80" src={iconUrl} alt="" />
      </span>
      <span className="flex min-w-0 items-center justify-between">
        {children}
      </span>
    </span>
  );
}

// A name someone wrote reads in its own direction (`dir="auto"`), on the
// interface's side of the pill (`text-match-parent`).
const NAME_CLASSES =
  'text-match-parent m-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap';

/**
 * The small accent square with a type's icon, which marks a kind of answer
 * where a whole pill would be too much — the create row of the attribute
 * picker names the type that a new attribute will have with it.
 *
 * Decorative: whoever renders it says the type in words beside it.
 */
export function AttributeTypeMark({
  type,
  className,
}: Readonly<{ type: VariableType; className?: string }>) {
  const style: AttributePillStyle = {
    '--variable-pill-accent': `oklch(var(${ACCENT_TOKENS[type]}))`,
  };
  return (
    <span
      aria-hidden
      data-attribute-type-mark={type}
      style={style}
      className={cx(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-sm bg-(--variable-pill-accent)',
        className,
      )}
    >
      <img className="w-3 opacity-80" src={ICON_URLS[type]} alt="" />
    </span>
  );
}

export default function AttributePill({
  name,
  type,
  missing = false,
  className,
}: AttributePillProps) {
  const accentToken =
    type === undefined ? DEFAULT_ACCENT_TOKEN : ACCENT_TOKENS[type];
  const iconUrl = type === undefined ? DEFAULT_ICON_URL : ICON_URLS[type];
  const style: AttributePillStyle = {
    // `--destructive` is already a colour rather than one of the theme's raw
    // triplets, so it is taken whole where the others are wrapped in `oklch`.
    '--variable-pill-accent': missing
      ? 'var(--destructive)'
      : `oklch(var(${accentToken}))`,
  };

  return (
    <data
      value={name}
      // Read by tests and by the end-to-end suite as the row's own statement
      // of which kind of answer it holds: an accent is not something a test
      // can assert on without asserting a colour, which is a design decision
      // rather than behaviour.
      data-attribute-type={type}
      data-attribute-missing={missing ? '' : undefined}
      className={pillClassName(className)}
      style={style}
    >
      <PillContents iconUrl={iconUrl}>
        <span dir="auto" className={NAME_CLASSES}>
          {name}
        </span>
      </PillContents>
    </data>
  );
}
