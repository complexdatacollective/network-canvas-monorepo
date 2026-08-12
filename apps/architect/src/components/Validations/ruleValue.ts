import {
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
} from './options';

export type ValidationValue = boolean | number | string | null;

export const isDraftComplete = (
  key: string,
  value: ValidationValue,
): boolean => {
  if (!key) {
    return false;
  }
  if (isValidationWithoutValue(key)) {
    return true;
  }
  if (isValidationWithNumberValue(key)) {
    return typeof value === 'number';
  }
  if (isValidationWithListValue(key)) {
    return typeof value === 'string' && value.length > 0;
  }
  return false;
};

export const parseForRule = (key: string, text: string): ValidationValue => {
  if (!key) {
    return null;
  }

  if (isValidationWithoutValue(key)) {
    return true;
  }

  if (isValidationWithNumberValue(key)) {
    if (text.trim() === '') {
      return null;
    }
    const parsed = Number(text);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (isValidationWithListValue(key)) {
    return text === '' ? null : text;
  }

  return null;
};

export const formatCommitted = (value: unknown): string => {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};
