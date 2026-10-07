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

// Overrides `controlVariants`' `min-w-fit`, which would widen the field to fit
// a long option label instead of letting it truncate.
const selectWrapperOwnVariants = cva({
  base: 'max-w-full min-w-0',
});

// Wrapper variants for select elements (shared by native and styled)
export const selectWrapperVariants = cva({
  composes: [
    textSizeVariants,
    heightVariants,
    controlVariants,
    inputControlVariants,
    inlineSpacingVariants,
    wrapperPaddingVariants,
    stateVariants,
    interactiveStateVariants,
    selectWrapperOwnVariants,
  ],
});

export type SelectOption = {
  value: string | number;
  /**
   * A label in a different language from the page — e.g. a locale autonym —
   * passes its `lang`/`dir`, which the rendered `<option>` carries so screen
   * readers switch pronunciation per option.
   */
  label: PresentationalText;
  disabled?: boolean;
};

/**
 * A labelled set of options, rendered by the native select as a real
 * `<optgroup>`.
 *
 * The alternative callers reached for before this existed — a disabled,
 * value-less option standing in as a heading — is not a heading to anything:
 * a screen reader announces it as one more option, its decoration
 * ("-- Number Types --") lands inside the accessible name, and every such
 * heading collapses to the same empty `value`, which React reports as a
 * duplicate key.
 */
export type SelectOptionGroup = {
  label: PresentationalText;
  options: SelectOption[];
};

export type SelectOptionOrGroup = SelectOption | SelectOptionGroup;

export const isSelectOptionGroup = (
  option: SelectOptionOrGroup,
): option is SelectOptionGroup => 'options' in option;

/** Every selectable option, with group membership discarded. */
export const flattenSelectOptions = (
  options: readonly SelectOptionOrGroup[],
): SelectOption[] =>
  options.flatMap((option) =>
    isSelectOptionGroup(option) ? option.options : [option],
  );
