export const isOptionValueEmpty = (value: unknown) =>
  value === undefined || value === null || value === '';

export const isOptionComplete = (option: unknown) => {
  if (!option || typeof option !== 'object') return false;

  const { label, value } = option as { label?: unknown; value?: unknown };

  return (
    typeof label === 'string' &&
    label.trim() !== '' &&
    !isOptionValueEmpty(value)
  );
};
