'use client';

import { Switch } from '@base-ui/react/switch';
import { LayoutGroup, motion } from 'motion/react';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { getInputState } from './form/utils/getInputState';
import { controlVariants, smallSizeVariants } from './styles/controlVariants';
import { cva, cx, type VariantProps } from './utils/cva';

const toggleOwnVariants = cva({
  base: cx(
    'border-0',
    'relative inline-flex aspect-2/1 items-center rounded-full p-[0.2em]',
    'focusable [--focus-color:var(--input-border)]',
    'transition-all duration-200',
  ),
  variants: {
    checked: {
      true: '',
      false: '',
    },
    state: {
      normal: 'cursor-pointer',
      disabled: 'cursor-not-allowed opacity-50',
      readOnly: 'cursor-default',
      invalid: '',
    },
  },
  compoundVariants: [
    {
      checked: false,
      state: 'normal',
      class: 'bg-input-contrast/30',
    },
    {
      checked: true,
      state: 'normal',
      class: 'bg-success',
    },
    {
      checked: false,
      state: 'disabled',
      class: 'bg-input-contrast/10',
    },
    {
      checked: true,
      state: 'disabled',
      class: 'bg-input-contrast/30',
    },
    {
      checked: false,
      state: 'readOnly',
      class: 'bg-input-contrast/20',
    },
    {
      checked: true,
      state: 'readOnly',
      class: 'bg-input-contrast/50',
    },
    {
      checked: false,
      state: 'invalid',
      class: 'bg-input-contrast/30 outline-destructive outline-2',
    },
    {
      checked: true,
      state: 'invalid',
      class: 'outline-destructive bg-current outline-2',
    },
  ],
  defaultVariants: {
    checked: false,
    state: 'normal',
  },
});

const toggleContainerVariants = cva({
  composes: [controlVariants, smallSizeVariants, toggleOwnVariants],
});

const toggleThumbVariants = cva({
  base: cx(
    'pointer-events-none block aspect-square h-full rounded-full shadow-sm',
    'transition-colors duration-200',
  ),
  variants: {
    state: {
      normal: 'bg-input interview:bg-input-contrast',
      disabled: 'bg-input-contrast/30',
      readOnly: 'bg-input-contrast/40',
      invalid: 'bg-input interview:bg-input-contrast',
    },
  },
  defaultVariants: {
    state: 'normal',
  },
});

export type ToggleProps = Omit<ComponentPropsWithoutRef<'button'>, 'onChange'> &
  VariantProps<typeof toggleContainerVariants> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    readOnly?: boolean;
  };

const Toggle = forwardRef<HTMLButtonElement, ToggleProps>((props, ref) => {
  const {
    className,
    checked = false,
    size,
    onCheckedChange,
    style,
    disabled,
    readOnly,
    'aria-invalid': ariaInvalid,
    ...buttonProps
  } = props;

  const isInvalid = ariaInvalid === true || ariaInvalid === 'true';
  const state = getInputState({
    disabled,
    readOnly,
    'aria-invalid': isInvalid,
  });

  return (
    // The thumb slides with a layout animation. Two things keep that animation
    // to the thumb's own movement across the track:
    //
    // - its own `LayoutGroup`: a group re-measures every member whenever any
    //   member updates, and a `LayoutGroup` wraps the content of every Dialog
    //   opened without a `layoutId`, so toggling one switch used to replay the
    //   thumb animation of every other switch whose row had moved;
    // - its parent is a `layoutRoot`: Motion measures a layout animation in
    //   page coordinates unless a parent is projecting, so a switch that moved
    //   in the same render it was toggled in (its row re-centred in a dialog
    //   that changed height) had its thumb slide in from where the track used
    //   to be. Measured relative to a `layoutRoot` that fills the track, the
    //   thumb only moves within it; the root itself never animates.
    <LayoutGroup inherit={false}>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={isInvalid || undefined}
        nativeButton
        render={
          <button
            {...buttonProps}
            ref={ref}
            type="button"
            disabled={disabled}
            className={toggleContainerVariants({
              size,
              checked,
              state,
              className,
            })}
            style={style}
          />
        }
      >
        <motion.span
          layout
          layoutRoot
          layoutDependency={checked}
          className="pointer-events-none flex size-full"
          style={{ justifyContent: checked ? 'flex-end' : 'flex-start' }}
        >
          <Switch.Thumb
            render={
              <motion.span
                className={toggleThumbVariants({ state })}
                layout
                layoutDependency={checked}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 30,
                }}
              />
            }
          />
        </motion.span>
      </Switch.Root>
    </LayoutGroup>
  );
});

Toggle.displayName = 'Toggle';

export default Toggle;
