import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactElement, type ReactNode, useId } from 'react';

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
  'aria-label': string;
  'className'?: string;
};

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
  className,
}: SegmentedSwitcherProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();

  return (
    // A plain track rather than a `Surface`: Surface always paints an opaque
    // depth/floating background that would sit over the translucent
    // `control-glass` fill and defeat the blur. The segments colour themselves,
    // so none of Surface's depth/contrast machinery is needed here.
    <div
      className={cx(
        'publish-colors relative inline-flex items-stretch rounded-full p-1',
        trackVariantClass[variant],
        trackHeightClass[size],
        className,
      )}
    >
      <ToggleGroup
        aria-label={ariaLabel}
        value={[value]}
        multiple={false}
        onValueChange={(next) => {
          const first = next[0];
          // No-deselect: ignore a change that would leave nothing selected.
          if (first === undefined) return;
          const picked = options.find((option) => option.value === first);
          if (picked) onValueChange(picked.value);
        }}
        className="flex items-stretch"
      >
        {options.map((option) => {
          const active = option.value === value;
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
              className={cx(
                segmentVariants({ size }),
                active ? 'text-primary-contrast' : 'text-text/80',
              )}
            >
              {active ? (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className="bg-primary absolute inset-0 rounded-full"
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 380, damping: 32 }
                  }
                />
              ) : null}
              {Icon ? (
                <Icon
                  aria-hidden
                  className={cx('relative stroke-[3px]', iconSizeClass[size])}
                />
              ) : null}
              <span className="relative">{option.label}</span>
            </Toggle>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
