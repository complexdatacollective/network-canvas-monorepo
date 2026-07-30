export const isOptionValueEmpty = (value: unknown) =>
  value === undefined || value === null || value === '';

export const isOptionComplete = (option: unknown) => {
  if (!option || typeof option !== 'object') return false;

  const label = 'label' in option ? option.label : undefined;
  const value = 'value' in option ? option.value : undefined;

  return (
    typeof label === 'string' &&
    label.trim() !== '' &&
    !isOptionValueEmpty(value)
  );
};
