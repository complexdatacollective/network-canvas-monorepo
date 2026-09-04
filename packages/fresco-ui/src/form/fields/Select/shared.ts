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
import { compose } from '../../../utils/cva';

// Wrapper variants for select elements (shared by native and styled)
export const selectWrapperVariants = compose(
  textSizeVariants,
  heightVariants,
  controlVariants,
  inputControlVariants,
  inlineSpacingVariants,
  wrapperPaddingVariants,
  stateVariants,
  interactiveStateVariants,
);

export type SelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
  /**
   * BCP 47 tag applied to the rendered `<option>` when its label is in a
   * different language from the page — e.g. a locale autonym — so screen
   * readers switch pronunciation per option.
   */
  lang?: string;
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
  label: string;
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
