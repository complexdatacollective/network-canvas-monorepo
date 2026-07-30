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
