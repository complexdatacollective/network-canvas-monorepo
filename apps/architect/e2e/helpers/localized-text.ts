import {
  type CurrentProtocol,
  type LocalizedString,
  messageText,
} from '@codaco/protocol-validation';

/**
 * The text Architect shows for a schema `LocalizedString`: the translation in
 * the protocol's default language, as plain text rather than the stored ICU
 * message. The page objects locate rows and controls by that text, and the
 * fixtures do not share one default language (`emptyProtocol()` is `en`, the
 * all-interfaces and sample protocols are `en-US`), so the protocol says which
 * translation to read.
 */
export function defaultLanguageText(
  protocol: Pick<CurrentProtocol, 'localization'>,
  value: LocalizedString,
): string {
  const { defaultLocale } = protocol.localization;
  const message = value[defaultLocale];
  if (message === undefined) {
    throw new Error(
      `expected a ${defaultLocale} translation in ${JSON.stringify(value)}`,
    );
  }
  return messageText(message);
}
