import type { ReactNode } from 'react';

import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

export type ConfigMessage = Required<
  Pick<MessageDescriptor, 'id' | 'defaultMessage'>
>;

export type MessageConfig<T> = {
  [Key in keyof T]: Key extends
    | 'label'
    | 'description'
    | 'heading'
    | 'sub'
    | 'placeholder'
    ? ConfigMessage
    : T[Key];
};

export type FormattedConfig<T> = T extends ConfigMessage
  ? string
  : T extends ReactNode
    ? T
    : T extends (...args: never[]) => unknown
      ? T
      : T extends readonly unknown[]
        ? { [Index in keyof T]: FormattedConfig<T[Index]> }
        : T extends object
          ? { [Key in keyof T]: FormattedConfig<T[Key]> }
          : T;

/**
 * Resolve explicit descriptors in presentation metadata at the render boundary.
 * Identifiers, enum values, callbacks and researcher-authored strings pass
 * through unchanged. The caller supplies the current shared formatter and
 * must include it in memo dependencies; no locale or formatted data is cached.
 */
export function formatConfig<T>(
  config: T,
  intl: IntlShape,
): FormattedConfig<T> {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value === null || typeof value !== 'object' || '$$typeof' in value)
      return value;
    if (
      'id' in value &&
      typeof value.id === 'string' &&
      'defaultMessage' in value
    ) {
      return intl.formatMessage(value as ConfigMessage);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, visit(entry)]),
    );
  };
  return visit(config) as FormattedConfig<T>;
}
