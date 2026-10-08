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
 */
export function toPresentationalText(
  resolved: ResolvedLocalizedString,
  options: readonly LocaleMetadata[],
): PresentationalText {
  const option = options.find((entry) => entry.locale === resolved.locale);
  invariant(option, `No locale option describes "${resolved.locale}"`);
  return { text: resolved.text, lang: resolved.locale, dir: option.direction };
}
