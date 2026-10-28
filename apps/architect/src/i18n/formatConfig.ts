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

const isConfigMessage = (value: object): value is ConfigMessage =>
  'id' in value &&
  typeof value.id === 'string' &&
  'defaultMessage' in value &&
  (typeof value.defaultMessage === 'string' ||
    Array.isArray(value.defaultMessage));

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
    if (isConfigMessage(value)) {
      return intl.formatMessage(value);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, visit(entry)]),
    );
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- visit rebuilds config with every descriptor formatted, which is what FormattedConfig<T> says; TypeScript cannot evaluate that conditional type for a generic T
  return visit(config) as FormattedConfig<T>;
}
