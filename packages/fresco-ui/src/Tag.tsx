'use client';

import { Toggle } from '@base-ui/react/toggle';
import * as React from 'react';

import { Badge } from './Badge';
import { type PaletteColor, paletteColorStyles } from './styles/palette';
import { cva, type VariantProps } from './utils/cva';

const tagVariants = cva({
  base: 'justify-center border-2 leading-tight font-medium whitespace-nowrap',
  variants: {
    size: {
      sm: 'gap-2 px-2.5 py-0.5',
      md: 'gap-2 px-3 py-1',
      lg: 'gap-2 px-4 py-2',
    },
    uppercase: {
      true: '',
      false: '',
    },
    tone: {
      default:
        '[--badge-color:color-mix(in_oklab,var(--text)_15%,transparent)] [--badge-contrast:var(--text)]',
      light:
        '[--badge-color:var(--color-platinum)] [--badge-contrast:var(--surface-2-contrast)]',
      pressed:
        '[--badge-color:var(--text)] [--badge-contrast:var(--background)]',
      pressedPrimary:
        '[--badge-color:var(--primary)] [--badge-contrast:var(--primary-contrast)]',
    },
    interactive: {
      true: 'focusable cursor-pointer',
      false: '',
    },
    disabled: {
      true: 'cursor-not-allowed opacity-50',
      false: '',
    },
  },
  compoundVariants: [
    { uppercase: true, size: 'sm', className: 'tracking-wide' },
  ],
  defaultVariants: {
    size: 'md',
    uppercase: true,
    tone: 'default',
    interactive: false,
    disabled: false,
  },
});

const dotVariants = cva({
  base: 'aspect-square h-auto shrink-0 rounded-full bg-(--tag-dot)',
  variants: {
    size: {
      sm: 'w-2.5',
      md: 'w-3',
      lg: 'w-3.5',
    },
  },
  defaultVariants: { size: 'md' },
});

export type TagColor = PaletteColor;
export type TagSize = NonNullable<VariantProps<typeof tagVariants>['size']>;

export type TagProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> & {
  /** Palette colour of the leading dot. Omit for a plain tag. */
  color?: TagColor | null;
  /** Renders the tag as a toggle button and marks it `aria-pressed`. */
  pressed?: boolean;
  /** Colour of the pressed state. */
  pressedTone?: 'text' | 'primary';
  /** Supplying this makes the tag interactive. */
  onPressedChange?: (pressed: boolean) => void;
  /** Muted display tone, for tags shown inside another control. */
  light?: boolean;
  /** Set false for labels whose own casing carries meaning. */
  uppercase?: boolean;
  disabled?: boolean;
  size?: TagSize;
};

type TagDotStyle = React.CSSProperties & { '--tag-dot'?: string };

const Tag = React.forwardRef<HTMLElement, TagProps>(function Tag(
  {
    children,
    color = null,
    pressed = false,
    pressedTone = 'text',
    onPressedChange,
    light = false,
    uppercase = true,
    disabled = false,
    size = 'md',
    className,
    ...props
  },
  ref,
) {
  const interactive = onPressedChange !== undefined;
  const dotStyle: TagDotStyle | undefined = color
    ? { '--tag-dot': paletteColorStyles[color].color }
    : undefined;

  return (
    <Badge
      ref={ref}
      size={size === 'lg' ? 'lg' : 'md'}
      uppercase={uppercase}
      appearance="filled"
      icon={
        color ? (
          <span
            aria-hidden
            className={dotVariants({ size })}
            style={dotStyle}
          />
        ) : undefined
      }
      className={tagVariants({
        size,
        uppercase,
        tone: pressed
          ? pressedTone === 'primary'
            ? 'pressedPrimary'
            : 'pressed'
          : light
            ? 'light'
            : 'default',
        interactive: interactive && !disabled,
        disabled,
        className,
      })}
      render={
        interactive ? (
          <Toggle
            pressed={pressed}
            disabled={disabled}
            onPressedChange={(next) => onPressedChange(next)}
          />
        ) : undefined
      }
      {...props}
    >
      {children}
    </Badge>
  );
});

export default Tag;
