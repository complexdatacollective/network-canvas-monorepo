import type { PresentationalText } from '../../../PresentationalText';
import {
  controlVariants,
  heightVariants,
  inlineSpacingVariants,
  inputControlVariants,
  interactiveStateVariants,
  stateVariants,
  textSizeVariants,
  wrapperPaddingVariants,
} from '../../../styles/controlVariants';
import { cva } from '../../../utils/cva';

export type ComboboxOption = {
  value: string | number;
  label: PresentationalText;
  disabled?: boolean;
};

// Overrides `controlVariants`' `min-w-fit`, which would widen the trigger to
// fit a long selection instead of letting it truncate.
const comboboxTriggerOwnVariants = cva({
  base: 'max-w-full min-w-0',
});

// Trigger variants - composed from shared control variants (same as Select)
export const comboboxTriggerVariants = cva({
  composes: [
    textSizeVariants,
    heightVariants,
    controlVariants,
    inputControlVariants,
    inlineSpacingVariants,
    wrapperPaddingVariants,
    stateVariants,
    interactiveStateVariants,
    comboboxTriggerOwnVariants,
  ],
});
