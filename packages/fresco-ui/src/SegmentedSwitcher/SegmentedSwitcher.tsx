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
  'size'?: 'sm' | 'md' | 'lg';
  'aria-label': string;
  'className'?: string;
};

const containerClasses =
  'border-outline bg-surface/50 inline-flex items-center rounded-full border p-1 backdrop-blur-md';

const segmentVariants = cva({
  base: cx(
    'font-heading relative inline-flex items-center justify-center rounded-full font-extrabold uppercase transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-40',
  ),
  variants: {
    size: {
      sm: 'gap-1.5 px-3.5 py-1.5 text-xs tracking-[0.06em]',
      md: 'gap-2 px-[18px] py-2.5 text-xs tracking-[0.06em]',
      lg: 'gap-2 px-5 py-2 text-sm tracking-wide',
    },
  },
  defaultVariants: { size: 'md' },
});

const iconSizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-[18px]',
};

export default function SegmentedSwitcher<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: SegmentedSwitcherProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();

  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(next) => {
        const first = next[0];
        // No-deselect: ignore a change that would leave nothing selected.
        if (first === undefined) return;
        const picked = options.find((option) => option.value === first);
        if (picked) onValueChange(picked.value);
      }}
      className={cx(containerClasses, className)}
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
  );
}
