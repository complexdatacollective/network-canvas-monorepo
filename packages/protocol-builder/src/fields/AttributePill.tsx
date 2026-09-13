import type { CSSProperties } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

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
 * pill — the picker states it beside the held value, the spotlight describes
 * each row with it — so this cannot decide for both. That is the one place it
 * parts company with Architect's pill, whose icon carried an `alt` of
 * "<type> attribute".
 */
export type AttributePillProps = Readonly<{
  /** The researcher's own name for the attribute. Never translated. */
  name: string;
  /**
   * The kind of answer it holds. Absent for a row that stands for something
   * other than a codebook attribute — the form-fields list's create sentinel —
   * which takes Architect's own fallback: the charcoal accent and the
   * question-mark mark, neither of which claims one of the nine kinds.
   */
  type?: VariableType;
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
  layout: new URL('./icons/layout-variable.svg', import.meta.url).href,
  location: new URL('./icons/location-variable.svg', import.meta.url).href,
  number: new URL('./icons/number-variable.svg', import.meta.url).href,
  ordinal: new URL('./icons/ordinal-variable.svg', import.meta.url).href,
  scalar: new URL('./icons/scalar-variable.svg', import.meta.url).href,
  text: new URL('./icons/text-variable.svg', import.meta.url).href,
} as const satisfies Record<VariableType, string>;

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
  layout: '--purple-pizazz',
  location: '--slate-blue--dark',
  number: '--paradise-pink',
  ordinal: '--sea-green',
  scalar: '--kiwi',
  text: '--cerulean-blue',
} as const satisfies Record<VariableType, string>;

/** Architect's fallback for anything that is not one of the nine. */
const DEFAULT_ACCENT_TOKEN = '--charcoal';

type AttributePillStyle = CSSProperties & {
  '--variable-pill-accent': string;
};

export default function AttributePill({
  name,
  type,
  className,
}: AttributePillProps) {
  const accentToken =
    type === undefined ? DEFAULT_ACCENT_TOKEN : ACCENT_TOKENS[type];
  const iconUrl = type === undefined ? DEFAULT_ICON_URL : ICON_URLS[type];
  const style: AttributePillStyle = {
    '--variable-pill-accent': `oklch(var(${accentToken}))`,
  };

  return (
    <data
      value={name}
      // Read by tests and by the end-to-end suite as the row's own statement
      // of which kind of answer it holds: an accent is not something a test
      // can assert on without asserting a colour, which is a design decision
      // rather than behaviour.
      data-attribute-type={type}
      className={cx(
        // `variable-pill` is Architect's marker class, the hook its own
        // same-area cascades key on (the printable summary scales it, the rule
        // preview zooms it). `w-max` gives WebKit an explicit max-content
        // basis; `w-fit` collapsed to the ellipsis width in Safari instead of
        // measuring the full name.
        'variable-pill font-monospace inline-flex h-12 w-max max-w-full min-w-0 flex-nowrap rounded-full p-0.5 text-base',
        'effect-shadow-sm cursor-default bg-(--variable-pill-accent)',
        className,
      )}
      style={style}
    >
      {/*
        A two-track grid gives WebKit a stable intrinsic width: the icon track
        is fixed, while the name contributes its max-content width and may
        still shrink to zero when the pill reaches its container or its max.
      */}
      <span className="text-text bg-surface grid h-full min-w-0 grid-cols-[3rem_minmax(0,auto)] overflow-hidden rounded-[inherit]">
        <span className="flex items-center justify-center border-r border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
          <img className="icon opacity-80" src={iconUrl} alt="" />
        </span>
        <span className="flex min-w-0 items-center justify-between">
          <span className="m-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap">
            {name}
          </span>
        </span>
      </span>
    </data>
  );
}
