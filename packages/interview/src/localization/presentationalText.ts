import { invariant } from 'es-toolkit';

import type { PresentationalText } from '@codaco/fresco-ui/PresentationalText';
import type {
  LocaleMetadata,
  ResolvedLocalizedString,
} from '@codaco/protocol-validation';

/**
 * A resolved protocol string in the shape fresco-ui components take, carrying
 * the language and direction the text is actually written in (`options` from
 * `useProtocolLocale`).
 *
 * Text in the unspecified language (`und`) stays a plain string, so it keeps
 * the surrounding language as protocol text always has, rather than telling
 * assistive technology that its language is unknown.
 */
export function toPresentationalText(
  resolved: ResolvedLocalizedString,
  options: readonly LocaleMetadata[],
): PresentationalText {
  if (resolved.locale === 'und') return resolved.text;

  const option = options.find((entry) => entry.locale === resolved.locale);
  invariant(option, `No locale option describes "${resolved.locale}"`);
  return { text: resolved.text, lang: resolved.locale, dir: option.direction };
}
