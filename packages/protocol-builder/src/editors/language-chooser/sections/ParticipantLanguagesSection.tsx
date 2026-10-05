import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import {
  languageMessages,
  useLanguageName,
} from '../../../localization/languageNames.ts';
import { localeDirection } from '../../../localization/localizedText.ts';
import { useProtocolLocalization } from '../../../localization/ProtocolLocalization.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { languageChooserMessages } from './languageChooserMessages.ts';

/**
 * The languages a participant will be offered, read from the protocol.
 *
 * Shown rather than edited: the choices are the languages the protocol is
 * written in, which belong to the whole protocol and are set in its settings.
 * A stage that kept a list of its own could offer a language nothing is
 * translated into, or leave out one that is.
 */
export default function ParticipantLanguagesSection() {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const localization = useProtocolLocalization();

  return (
    <BuilderSection
      title={intl.formatMessage(languageChooserMessages.languagesTitle)}
      description={intl.formatMessage(
        languageChooserMessages.languagesDescription,
      )}
    >
      {localization !== undefined && (
        <>
          <ul
            aria-label={intl.formatMessage(
              languageChooserMessages.languagesListLabel,
            )}
            className="flex flex-col gap-2"
          >
            {localization.locales.map((locale) => (
              <li key={locale} className="flex items-center gap-2">
                <span lang={locale} dir={localeDirection(locale)}>
                  {languageName(locale)}
                </span>
                {locale === localization.defaultLocale && (
                  <Badge size="sm" tone="neutral" appearance="outline">
                    {intl.formatMessage(languageMessages.defaultLanguage)}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          {localization.locales.length === 1 && (
            <Paragraph margin="none" emphasis="muted">
              {intl.formatMessage(languageChooserMessages.singleLanguage)}
            </Paragraph>
          )}
        </>
      )}
    </BuilderSection>
  );
}
