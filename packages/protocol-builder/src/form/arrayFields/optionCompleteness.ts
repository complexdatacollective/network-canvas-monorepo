/**
 * What counts as a missing half of an option, shared by the row that shows the
 * gap and the array rule that refuses to save it. One definition, so the two
 * can never disagree about which option is finished.
 *
 * The other thing that can be wrong with a list of options — two of them a
 * participant would read the same way — is asked of shared-consts'
 * `hasDuplicateOptionLabels`, which is asked by Architect's own list too.
 */
export const isOptionLabelEmpty = (label: unknown) =>
  typeof label !== 'string' || label.trim() === '';

export const isOptionValueEmpty = (value: unknown) =>
  value === undefined || value === null || value === '';

export const isOptionComplete = (option: unknown) => {
  if (!option || typeof option !== 'object') return false;

  const label = 'label' in option ? option.label : undefined;
  const value = 'value' in option ? option.value : undefined;

  return !isOptionLabelEmpty(label) && !isOptionValueEmpty(value);
};
