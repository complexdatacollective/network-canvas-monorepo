import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import type { IntlShape, MessageDescriptor } from 'react-intl/server';

type MessageErrorReference = Readonly<{ messageError: string }>;

type MessageErrorValue =
  | string
  | number
  | boolean
  | null
  | MessageErrorReference
  | Readonly<{ list: readonly (string | MessageErrorReference)[] }>;

/** Values that can cross an existing string-only error/result boundary. */
export type MessageErrorValues = Readonly<Record<string, MessageErrorValue>>;

const PREFIX = '@codaco/app-i18n/error/v1:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isErrorReference = (value: unknown): value is MessageErrorReference =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  typeof value.messageError === 'string';

/** Validate the source or precompiled defaults without pulling a parser into the bundle. */
function isMessageAst(value: unknown): value is MessageFormatElement[] {
  if (!Array.isArray(value)) return false;
  return (value as unknown[]).every((element) => {
    if (!isRecord(element)) return false;
    if (element.type === 7) return true; // ICU plural pound sign.
    if (typeof element.value !== 'string') return false;
    switch (element.type) {
      case 0: // Literal.
      case 1: // Argument.
        return true;
      case 2: // Number.
      case 3: // Date.
      case 4: // Time.
        return (
          element.style === undefined ||
          typeof element.style === 'string' ||
          isRecord(element.style)
        );
      case 5: // Select.
      case 6: // Plural.
        return (
          (element.type === 5 ||
            ((element.pluralType === 'cardinal' ||
              element.pluralType === 'ordinal') &&
              typeof element.offset === 'number' &&
              Number.isFinite(element.offset))) &&
          isRecord(element.options) &&
          Object.hasOwn(element.options, 'other') &&
          Object.values(element.options).every(
            (option) => isRecord(option) && isMessageAst(option.value),
          )
        );
      case 8: // Rich tag (plain error transports cannot supply React callbacks).
        return isMessageAst(element.children);
      default:
        return false;
    }
  });
}

function isValues(value: unknown): value is MessageErrorValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) =>
        item === null ||
        typeof item === 'string' ||
        typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item)) ||
        isErrorReference(item) ||
        (isRecord(item) &&
          Object.keys(item).length === 1 &&
          Array.isArray(item.list) &&
          (item.list as unknown[]).every(
            (entry) => typeof entry === 'string' || isErrorReference(entry),
          )),
    )
  );
}

/**
 * Retain a descriptor and named values through an existing string-only result
 * contract. No locale or translated prose is captured. Production defaults may
 * already be ICU AST, so preserve them instead of requiring a runtime parser.
 */
export function createMessageError(
  message: MessageDescriptor,
  values: MessageErrorValues = {},
): string {
  if (
    !message.id ||
    message.defaultMessage === undefined ||
    !isValues(values)
  ) {
    throw new TypeError(
      'createMessageError requires an id, English defaults, and serializable primitive, list or message-error values',
    );
  }
  return (
    PREFIX +
    JSON.stringify({
      message: { id: message.id, defaultMessage: message.defaultMessage },
      values,
    })
  );
}

function formatEncodedMessageError(
  error: string,
  intl: IntlShape,
  depth: number,
): string | undefined {
  if (depth > 12 || !error.startsWith(PREFIX)) return undefined;
  try {
    const payload: unknown = JSON.parse(error.slice(PREFIX.length));
    if (
      !isRecord(payload) ||
      !isRecord(payload.message) ||
      !isValues(payload.values)
    )
      return undefined;
    const { id, defaultMessage } = payload.message;
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      !(typeof defaultMessage === 'string' || isMessageAst(defaultMessage))
    )
      return undefined;
    const descriptor: MessageDescriptor = { id, defaultMessage };
    const resolveReference = (value: MessageErrorReference) =>
      formatEncodedMessageError(value.messageError, intl, depth + 1) ??
      value.messageError;
    const values = Object.fromEntries(
      Object.entries(payload.values).map(([name, value]) => [
        name,
        isErrorReference(value)
          ? resolveReference(value)
          : typeof value === 'object' && value !== null
            ? intl.formatList(
                value.list.map((item) =>
                  typeof item === 'string' ? item : resolveReference(item),
                ),
              )
            : value,
      ]),
    );
    return intl.formatMessage(descriptor, values);
  } catch {
    return undefined;
  }
}

/** Resolve an encoded error in the current locale; ordinary text is left to its caller. */
export function formatMessageError(
  error: string,
  intl: IntlShape,
): string | undefined {
  return formatEncodedMessageError(error, intl, 0);
}
