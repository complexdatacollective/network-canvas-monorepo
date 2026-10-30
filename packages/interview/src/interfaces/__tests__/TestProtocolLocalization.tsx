import { type ReactNode, useMemo } from 'react';

import {
  getLocaleMetadata,
  type InterfaceText,
  type LocaleTag,
  type LocalizationDeclaration,
  withInterfaceText,
} from '@codaco/protocol-validation';

import { InterfaceTextOverlay } from '../../localization/InterfaceTextOverlay';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalizationProvider';

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};
const NO_REQUESTED_LOCALES: readonly string[] = [];
const noop = () => undefined;

/**
 * The interface text Network Canvas supplies for a protocol in `localization`
 * with `stages`, as a protocol made in Architect holds it.
 */
export const suppliedInterfaceText = (
  localization: LocalizationDeclaration,
  stages: readonly unknown[] = [],
): InterfaceText =>
  withInterfaceText<{
    localization: LocalizationDeclaration;
    stages: readonly unknown[];
    interfaceText?: InterfaceText;
  }>({ localization, stages }).interfaceText ?? {};

/**
 * The protocol localization an interface reads inside the Shell, for tests
 * that render an interface on its own. `locale` stands in for the
 * participant's stated preference; without it the protocol default is shown.
 * With `interfaceText`, the interview's built-in text is worded by it, as the
 * Shell words it by the protocol's.
 */
export function TestProtocolLocalization({
  localization = ENGLISH_ONLY,
  locale = null,
  interfaceText,
  children,
}: {
  localization?: LocalizationDeclaration;
  locale?: LocaleTag | null;
  interfaceText?: InterfaceText;
  children: ReactNode;
}) {
  const localeOptions = useMemo(
    () => localization.locales.map((tag) => getLocaleMetadata(tag)),
    [localization],
  );

  return (
    <ProtocolLocalizationProvider
      localization={localization}
      localeOptions={localeOptions}
      requestedLocales={NO_REQUESTED_LOCALES}
      localePreference={locale}
      onLocalePreferenceChange={noop}
    >
      {interfaceText === undefined ? (
        children
      ) : (
        <InterfaceTextOverlay interfaceText={interfaceText}>
          {children}
        </InterfaceTextOverlay>
      )}
    </ProtocolLocalizationProvider>
  );
}
