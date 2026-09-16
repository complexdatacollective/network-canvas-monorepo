'use client';

import { Toggle } from '@base-ui/react/toggle';
import * as React from 'react';

import { Badge, type BadgeSize } from './Badge';
import { type PaletteColor, paletteColorStyles } from './styles/palette';
import { cva } from './utils/cva';

const tagVariants = cva({
  base: 'justify-center',
  variants: {
    tone: {
      default:
        '[--badge-color:color-mix(in_oklab,var(--text)_15%,transparent)] [--badge-contrast:var(--text)]',
      light:
        '[--badge-color:var(--color-platinum)] [--badge-contrast:var(--surface-2-contrast)]',
      pressed:
        '[--badge-color:var(--text)] [--badge-contrast:var(--background)]',
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
  defaultVariants: {
    tone: 'default',
    interactive: false,
    disabled: false,
  },
});

const dotVariants = cva({
  base: 'aspect-square h-auto shrink-0 rounded-full bg-(--tag-dot)',
  variants: {
    size: {
      sm: 'w-2',
      md: 'w-2.5',
      lg: 'w-3',
    },
  },
  defaultVariants: { size: 'md' },
});

export type TagColor = PaletteColor;
export type TagSize = BadgeSize;

export type TagProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> & {
  /** Palette colour of the leading dot. Omit for a plain tag. */
  color?: TagColor | null;
  /** Renders the tag as a toggle button and marks it `aria-pressed`. */
  pressed?: boolean;
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
      size={size}
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
        tone: pressed ? 'pressed' : light ? 'light' : 'default',
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
