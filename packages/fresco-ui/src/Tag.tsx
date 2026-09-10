'use client';

import { Toggle } from '@base-ui/react/toggle';
import * as React from 'react';

import { type PaletteColor, paletteColorStyles } from './styles/palette';
import { cva, cx, type VariantProps } from './utils/cva';

const tagVariants = cva({
  base: 'inline-flex items-center justify-center rounded-full border-2 border-transparent text-xs leading-tight font-medium whitespace-nowrap',
  variants: {
    size: {
      sm: 'gap-2 px-2.5 py-0.5',
      md: 'gap-2 px-3 py-1',
    },
    uppercase: {
      true: 'uppercase',
      false: '',
    },
    tone: {
      default: 'bg-text/15 text-text',
      light: 'bg-platinum text-surface-2-contrast',
      pressed: 'bg-text text-background',
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
    size: 'md',
    uppercase: true,
    tone: 'default',
    interactive: false,
    disabled: false,
  },
  // Loose tracking is a caps treatment; set in mixed case the label keeps the
  // xs scale's own letter-spacing.
  compoundVariants: [
    { uppercase: true, size: 'sm', className: 'tracking-wide' },
    { uppercase: true, size: 'md', className: 'tracking-widest' },
  ],
});

const dotVariants = cva({
  base: 'aspect-square h-auto shrink-0 rounded-full bg-(--tag-dot)',
  variants: {
    size: {
      sm: 'w-2.5',
      md: 'w-3',
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
  const classes = tagVariants({
    size,
    uppercase,
    tone: pressed ? 'pressed' : light ? 'light' : 'default',
    interactive: interactive && !disabled,
    disabled,
    className,
  });
  const setRef = (node: HTMLElement | null) => {
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  const dotStyle: TagDotStyle | undefined = color
    ? { '--tag-dot': paletteColorStyles[color].color }
    : undefined;
  const content = (
    <>
      {color ? (
        <span
          aria-hidden
          className={cx(dotVariants({ size }))}
          style={dotStyle}
        />
      ) : null}
      {children}
    </>
  );

  if (interactive) {
    return (
      <Toggle
        ref={setRef}
        pressed={pressed}
        disabled={disabled}
        onPressedChange={(next) => onPressedChange(next)}
        className={classes}
        {...props}
      >
        {content}
      </Toggle>
    );
  }

  return (
    <div ref={setRef} className={classes} {...props}>
      {content}
    </div>
  );
});

export default Tag;
