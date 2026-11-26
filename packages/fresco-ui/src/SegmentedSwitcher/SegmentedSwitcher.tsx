'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { LucideIcon } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import type { ReactElement, ReactNode } from 'react';

import { usePrefersReducedMotion } from '../reducedMotion';
import { cva, cx } from '../utils/cva';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  // Base UI render escape hatch: render the segment as e.g. a wouter <Link>.
  render?: ReactElement;
};

export type SegmentedSwitcherProps<T extends string> = {
  'value': T;
  'onValueChange': (value: T) => void;
  'options': SegmentedOption<T>[];
  'size'?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Track treatment. `outline` (default) reads like a normal outline button;
   * `glass` adds the translucent, backdrop-blurred, shadowed glass treatment
   * with a thicker border.
   */
  'variant'?: 'outline' | 'glass';
  'className'?: string;
  /** Whether every segment ignores the pointer and the keyboard. */
  'disabled'?: boolean;
  /** For a switcher that is a field's control, which the field names. */
  'id'?: string;
  'aria-describedby'?: string;
} & (
  | { 'aria-label': string; 'aria-labelledby'?: undefined }
  // Named by an element on the page, such as its field's label.
  | { 'aria-label'?: undefined; 'aria-labelledby': string }
);

// The outer track height is pinned to the matching Button height at each size
// token (sm h-10=40, md h-12=48, lg h-16=64, xl h-20=80) via `trackHeightClass`
// so the switcher lines up with Buttons exactly. The segments stretch to fill
// whatever inner height remains after the border + `p-1` padding, so they stay
// concentric with the track regardless of the border width (see below).
const trackHeightClass: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'h-10',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-20',
};

const trackVariantClass: Record<'outline' | 'glass', string> = {
  // Like a normal outline button: a 2px themed border, no fill.
  outline: 'border-2 border-outline',
  // Translucent surface + backdrop blur + shadow + a thicker (control) border.
  glass: 'control-glass border-outline',
};

// Segments stretch to fill the track's inner height (the flex chain uses
// `items-stretch`) rather than taking a fixed height. A `rounded-full` segment
// that fills the inner box is concentric with the `rounded-full` track — inset
// uniformly by the border + `p-1` — so the active pill nests cleanly at any
// size and border width instead of leaving a crescent gap at the rounded ends.
const segmentVariants = cva({
  base: cx(
    'font-heading relative inline-flex items-center justify-center rounded-full font-extrabold uppercase transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-40',
  ),
  variants: {
    size: {
      sm: 'gap-1.5 px-3.5 text-xs tracking-[0.06em]',
      md: 'gap-2 px-[18px] text-xs tracking-[0.06em]',
      lg: 'gap-2 px-5 text-sm tracking-wide',
      xl: 'gap-2.5 px-6 text-base tracking-wide',
    },
  },
  defaultVariants: { size: 'md' },
});

const iconSizeClass: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-[18px]',
  xl: 'size-5',
};

export default function SegmentedSwitcher<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  variant = 'outline',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  id,
  className,
  disabled,
}: SegmentedSwitcherProps<T>) {
  const reduced = usePrefersReducedMotion();
  const activeIndex = options.findIndex((option) => option.value === value);

  return (
    // The highlight is ONE element that stays mounted and moves between grid
    // cells, never a pill per segment joined by a shared `layoutId`. Motion
    // measures a shared-element transition in page coordinates and never
    // relative to a parent, so when the switcher itself moved in the same
    // render (a dialog that re-centres because the choice changed its
    // contents), the pill slid in from where the track used to be. A plain
    // `layout` element whose parent is a `layoutRoot` is measured relative to
    // that parent instead, so moving the whole switcher no longer moves the
    // highlight within it. Its own `LayoutGroup` keeps it out of an enclosing
    // group, which would otherwise re-measure it whenever a neighbour changes
    // (see `Toggle`).
    //
    // A plain track rather than a `Surface`: Surface always paints an opaque
    // depth/floating background that would sit over the translucent
    // `control-glass` fill and defeat the blur. The segments colour themselves,
    // so none of Surface's depth/contrast machinery is needed here.
    <LayoutGroup inherit={false}>
      <motion.div
        layout
        layoutRoot
        layoutDependency={value}
        className={cx(
          'publish-colors relative isolate inline-flex items-stretch rounded-full p-1',
          trackVariantClass[variant],
          trackHeightClass[size],
          className,
        )}
      >
        <ToggleGroup
          id={id}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          value={[value]}
          multiple={false}
          onValueChange={(next) => {
            const first = next[0];
            // No-deselect: ignore a change that would leave nothing selected.
            if (first === undefined) return;
            const picked = options.find((option) => option.value === first);
            if (picked) onValueChange(picked.value);
          }}
          // One row of cells, one per option. The highlight shares the active
          // option's cell, so it always has that segment's size without being
          // measured. It comes last, so the track's baseline is still the
          // first segment's text, and its negative `z-index` (kept inside the
          // `isolate` track) paints it under the segments.
          className="grid auto-cols-auto grid-rows-1 items-stretch"
        >
          {options.map((option, index) => {
            const active = index === activeIndex;
            const Icon = option.icon;
            return (
              <Toggle
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                render={option.render}
                // The render escape hatch may swap in a non-button element (e.g. a
                // wouter <Link>); tell Base UI so it doesn't assume button semantics.
                nativeButton={option.render ? false : undefined}
                style={{ gridRow: 1, gridColumn: index + 1 }}
                className={cx(
                  segmentVariants({ size }),
                  active ? 'text-primary-contrast' : 'text-text/80',
                )}
              >
                {Icon ? (
                  <Icon
                    aria-hidden
                    className={cx('stroke-[3px]', iconSizeClass[size])}
                  />
                ) : null}
                <span>{option.label}</span>
              </Toggle>
            );
          })}
          {activeIndex === -1 ? null : (
            <motion.span
              aria-hidden
              layout
              layoutDependency={value}
              className={cx(
                'bg-primary -z-1',
                // Dimmed with its segment, which `disabled:opacity-40` dims.
                (disabled || options[activeIndex]?.disabled) && 'opacity-40',
              )}
              // A numeric radius, so Motion keeps the ends round while the
              // highlight stretches between segments of different widths.
              style={{
                gridRow: 1,
                gridColumn: activeIndex + 1,
                borderRadius: 9999,
              }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 380, damping: 32 }
              }
            />
          )}
        </ToggleGroup>
      </motion.div>
    </LayoutGroup>
  );
}
