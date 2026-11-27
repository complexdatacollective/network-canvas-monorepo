'use client';

import { Settings2, Trash2 } from 'lucide-react';
import { type ComponentProps, forwardRef } from 'react';

import { Button, type ButtonProps, IconButton } from '../../../Button';
import { blockActionProps } from './blockFrames';

type BlockSettingsButtonProps = Omit<
  ComponentProps<typeof IconButton>,
  'icon' | 'size' | 'variant' | 'color' | 'aria-label' | 'children'
> & {
  /**
   * The name of the button and of the settings it opens, such as "Field
   * settings". Read only by a screen reader, so plain English.
   */
  name: string;
};

/**
 * The button that opens a block's settings: the same for every block, in its
 * tab (`BlockTab`) or in its own header (a logic block). A small round icon
 * button with no fill, in the selected colour while its settings are open.
 *
 * Render it as the trigger of the settings' popover:
 *
 *     <PopoverTrigger nativeButton render={<BlockSettingsButton name="…" />} />
 *
 * so that the popover is attached to it, opening beside it with its arrow
 * pointing at it, and so that the popover's `aria-expanded` on it gives it
 * the selected colour while the settings are open (`Button` reads that
 * state). A button that opens its settings some other way says whether they
 * are open with `aria-expanded` itself, and anchors them to the button.
 *
 * Enter on the selected block presses it (`blockActionProps`).
 */
export const BlockSettingsButton = forwardRef<
  HTMLButtonElement,
  BlockSettingsButtonProps
>(function BlockSettingsButton({ name, ...props }, ref) {
  return (
    <IconButton
      ref={ref}
      size="sm"
      variant="text"
      aria-label={name}
      icon={<Settings2 aria-hidden />}
      data-block-button="settings"
      {...blockActionProps}
      {...props}
    />
  );
});

type BlockDeleteButtonProps = Omit<
  ButtonProps,
  'icon' | 'iconPosition' | 'size' | 'variant' | 'color'
>;

/**
 * The button that deletes a block: the same for every block. A small filled
 * button in the destructive colour, with a bin and a label that names what
 * it deletes ("Delete field"). It belongs at the end of the block's settings,
 * as their last control.
 */
export const BlockDeleteButton = forwardRef<
  HTMLButtonElement,
  BlockDeleteButtonProps
>(function BlockDeleteButton({ type = 'button', ...props }, ref) {
  return (
    <Button
      ref={ref}
      type={type}
      size="sm"
      color="destructive"
      icon={<Trash2 aria-hidden />}
      data-block-button="delete"
      {...props}
    />
  );
});
