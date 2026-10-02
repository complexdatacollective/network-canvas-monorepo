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
  label: string;
  disabled?: boolean;
};

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
  ],
});
