import type { HTMLAttributes } from 'react';

import { cva, cx } from './utils/cva';

/**
 * The keycap itself. The theme already styles the bare `kbd` element
 * (monospace, hairline border, tinted face, raised edge), so this adds only
 * what a hint rendered inline in running text or in a dense list needs: a
 * predictable minimum width, so single characters (`↑`, `G`) are the same
 * width as each other rather than as narrow as their glyph.
 */
const keycapVariants = cva({
  base: cx(
    'min-w-5 shrink-0 whitespace-nowrap',
    // The element's own radius is the theme's general one, which on something
    // this small rounds into a pill and stops reading as a key. The smallest
    // step keeps the corner soft while the shape stays a cap.
    'rounded-2xs',
  ),
});

export type KbdProps = {
  /**
   * One key, or the keys of a combination or sequence — each renders as its
   * own cap. Keys are the literal glyphs the keyboard shows (`⌘K`, `Esc`,
   * `↵`, `G`) and are never translated.
   */
  keys: string | string[];
  /**
   * What the caps mean, as one whole translated string: "Shortcut: G then P",
   * "Press Escape to close". It becomes the hint's accessible name, and the
   * caps themselves are then hidden from assistive technology — a row of bare
   * letters announced one at a time says nothing useful.
   */
  label?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'children'>;

/**
 * A keyboard key, or a run of them, rendered as real `kbd` elements.
 *
 * ```tsx
 * <Kbd keys="Esc" />
 * <Kbd keys="⌘K" label="Search and commands (Command K)" />
 * <Kbd keys={['G', 'P']} label="Shortcut: G then P" />
 * ```
 *
 * Whether a run is a combination (held together) or a sequence (pressed one
 * after another) is carried by `label`, not by the caps: no separator glyph
 * can say it in every language, and the accessible name has to say it anyway.
 */
export default function Kbd({ keys, label, className, ...props }: KbdProps) {
  const sequence = Array.isArray(keys) ? keys : [keys];

  // A lone cap with nothing to explain is just a `kbd`: no wrapper, no
  // announcement of its own, so it reads inline exactly as the element does.
  if (sequence.length === 1 && label === undefined) {
    return (
      <kbd className={keycapVariants({ className })} {...props}>
        {sequence[0]}
      </kbd>
    );
  }

  const caps = sequence.map((key, index) => (
    <kbd
      // Keys repeat within a run (`⌘` `⌘`), so position is the identity here.
      key={`${index}-${key}`}
      className={keycapVariants()}
    >
      {key}
    </kbd>
  ));

  return (
    <span
      className={cx('inline-flex items-center gap-1', className)}
      {...props}
    >
      <span aria-hidden={label !== undefined} className="inline-flex gap-1">
        {caps}
      </span>
      {label === undefined ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}
