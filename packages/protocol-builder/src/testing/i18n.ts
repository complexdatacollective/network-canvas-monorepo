import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

import { protocolBuilderCatalogs } from '../locales/catalogs.ts';

/**
 * Formatters for tests, in the two languages the package ships copy for.
 *
 * The suite mounts no `AppI18nProvider`, so components render their English
 * `defaultMessage`s and the existing English assertions stand unchanged. These
 * are for the two cases where a hand-written literal would not be an honest
 * oracle.
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

/**
 * A fixture's own words as a message descriptor.
 *
 * `SectionCapability.confirmClear` takes descriptors rather than strings,
 * because the section that owns a capability owns its words. A test or a story
 * that invents a section still has to hand it something, and inventing an id
 * under `protocolBuilder.*` would put a message in the namespace that no
 * translator can ever find. The id here is deliberately outside it, and
 * nothing extracts it — `collectSourceFiles` skips `__tests__` and
 * `*.stories.*` — so a fixture goes on rendering exactly the English it
 * declares.
 */
export const fixtureMessage = (defaultMessage: string): MessageDescriptor => ({
  id: `fixture.${defaultMessage.replaceAll(/[^A-Za-z0-9]/gu, '').slice(0, 48) || 'message'}`,
  defaultMessage,
});
