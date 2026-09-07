import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

import { protocolBuilderCatalogs } from '../locales/catalogs.ts';

/**
 * Formatters for tests, in the two languages the package ships copy for.
 *
 * The suite mounts no `AppI18nProvider`, so components render their English
 * `defaultMessage`s and the existing English assertions stand unchanged. These
 * are for the two cases where a hand-written literal would not be an honest
 * oracle: a module that PRODUCES copy — `describeRule` — has to be handed the
 * same formatter the component beside it renders through, so a translated
 * preview beside an English verdict fails; and a value that is a message
 * DESCRIPTOR rather than a phrase has to be formatted before an assertion can
 * name the words a researcher reads.
 */
export const enIntl: IntlShape = createAppIntl({ locale: 'en' });

export const esIntl: IntlShape = createAppIntl({
  locale: 'es',
  messages: protocolBuilderCatalogs.es,
});

/**
 * A message that travelled through a string-only contract, read back.
 *
 * `ResourceGatewayFailure.message`, a `CompoundEditResult`'s `message` and a
 * `ProtocolContextIssue`'s `message` each carry either one of this package's
 * encoded descriptors or a plain sentence written by a host or a schema. This
 * is the same `formatMessageError(text, intl) ?? text` the render sites use,
 * so a test asserting on one of them asserts on what the researcher reads —
 * and still fails when the copy behind the descriptor changes.
 */
export const readMessage = (text: string, intl: IntlShape = enIntl): string =>
  formatMessageError(text, intl) ?? text;
