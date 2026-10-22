import { normalizeCodebookName } from '@codaco/shared-consts';

// A label is a localized string; it is written once any translation has text.
export const isOptionLabelEmpty = (label: unknown) =>
  typeof label !== 'object' ||
  label === null ||
  !Object.values(label).some(
    (text) => typeof text === 'string' && text.trim() !== '',
  );

// A value of nothing but spaces is empty: it is saved trimmed.
export const isOptionValueEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && normalizeCodebookName(value) === '');

export const isOptionComplete = (option: unknown) => {
  if (!option || typeof option !== 'object') return false;

  const label = 'label' in option ? option.label : undefined;
  const value = 'value' in option ? option.value : undefined;

  return !isOptionLabelEmpty(label) && !isOptionValueEmpty(value);
};
