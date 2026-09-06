/**
 * What counts as a missing half of an option, shared by the row that shows the
 * gap and the array rule that refuses to save it. One definition, so the two
 * can never disagree about which option is finished.
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
