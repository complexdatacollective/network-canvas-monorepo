import { type ReactNode, useMemo } from 'react';

import {
  getLocaleMetadata,
  type LocaleTag,
  type LocalizationDeclaration,
} from '@codaco/protocol-validation';

import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalizationProvider';

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};
const NO_REQUESTED_LOCALES: readonly string[] = [];
const noop = () => undefined;

/**
 * The protocol localization an interface reads inside the Shell, for tests
 * that render an interface on its own. `locale` stands in for the
 * participant's stated preference; without it the protocol default is shown.
 */
export function TestProtocolLocalization({
  localization = ENGLISH_ONLY,
  locale = null,
  children,
}: {
  localization?: LocalizationDeclaration;
  locale?: LocaleTag | null;
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
      recordedLocale={null}
      onLocalePreferenceChange={noop}
      onLocaleRecorded={noop}
    >
      {children}
    </ProtocolLocalizationProvider>
  );
}
