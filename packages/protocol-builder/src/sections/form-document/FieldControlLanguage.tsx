import { DirectionProvider } from '@base-ui/react/direction-provider';
import { type ReactNode, useMemo } from 'react';

import {
  InterfaceTextOverlay,
  ProtocolLocalizationProvider,
} from '@codaco/interview';
import {
  getLocaleMetadata,
  type InterfaceText,
  type LocaleTag,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';

/** The preview has no participant whose language choice could be kept. */
const ignoreLocaleChange = () => undefined;

const NO_REQUESTED_LOCALES: readonly string[] = [];

/**
 * The protocol's languages, as the interview resolves the field's copy in
 * them: the language being edited, falling back as a participant's would.
 * The field's own words around its control, such as a password field's
 * placeholder, come from the protocol's interface text in that language, as
 * they do in the interview.
 */
export function FieldControlLanguage({
  localization,
  locale,
  interfaceText,
  children,
}: Readonly<{
  localization: ProtocolLocalization;
  locale: LocaleTag;
  interfaceText: InterfaceText | undefined;
  children: ReactNode;
}>) {
  const localeOptions = useMemo(
    () => localization.locales.map((declared) => getLocaleMetadata(declared)),
    [localization],
  );
  const { direction } = getLocaleMetadata(locale);
  return (
    <ProtocolLocalizationProvider
      localization={localization}
      localeOptions={localeOptions}
      requestedLocales={NO_REQUESTED_LOCALES}
      localePreference={locale}
      onLocalePreferenceChange={ignoreLocaleChange}
    >
      {/* The field's language boundary, as the interview Shell's region is:
          everything inside, the participant's popups included, takes the
          language being previewed and lays out in its direction, and no text
          inside marks a language of its own. */}
      <InterfaceTextOverlay interfaceText={interfaceText}>
        <DirectionProvider direction={direction}>
          <div lang={locale} dir={direction}>
            {children}
          </div>
        </DirectionProvider>
      </InterfaceTextOverlay>
    </ProtocolLocalizationProvider>
  );
}
