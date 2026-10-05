import { useSelector } from 'react-redux';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  getHasUnspecifiedLanguage,
  getLocalizationCoverage,
} from '~/selectors/issues';

const messages = defineMessages({
  unspecifiedTitle: {
    id: 'architect.localization.localizationAlert.unspecifiedTitle',
    defaultMessage: 'Identify the language of your protocol',
    description:
      'Title of the notice shown when a protocol has text whose language has not been identified.',
  },
  unspecifiedDescription: {
    id: 'architect.localization.localizationAlert.unspecifiedDescription',
    defaultMessage:
      'This protocol was made before protocols declared their languages, so its text is marked as an unidentified language. Say which language it is written in before you add translations.',
    description:
      'Notice shown when a protocol has text whose language has not been identified.',
  },
  missingTitle: {
    id: 'architect.localization.localizationAlert.missingTitle',
    defaultMessage:
      '{count, plural, one {# missing translation} other {# missing translations}}',
    description: 'Title of the notice about missing translations.',
  },
  missingDescription: {
    id: 'architect.localization.localizationAlert.missingDescription',
    defaultMessage:
      'Some text is not translated into every language of this protocol. Participants see it in another language instead.',
    description: 'Notice shown when some translations are missing.',
  },
  goToLanguages: {
    id: 'architect.localization.localizationAlert.goToLanguages',
    defaultMessage: 'Go to Languages',
    description:
      'Link to the Languages page, where the protocol languages and translations are managed.',
  },
});

/**
 * Stage-list notice about the protocol's languages: text whose language is
 * not identified yet, or else missing translations. A warning only; neither
 * stops the protocol being saved or used.
 */
const LocalizationAlert = () => {
  const intl = useAppIntl();
  const hasUnspecifiedLanguage = useSelector(getHasUnspecifiedLanguage);
  const { warnings } = useSelector(getLocalizationCoverage);

  if (!hasUnspecifiedLanguage && warnings.length === 0) return null;

  return (
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <AlertTitle>
        {hasUnspecifiedLanguage
          ? intl.formatMessage(messages.unspecifiedTitle)
          : intl.formatMessage(messages.missingTitle, {
              count: warnings.length,
            })}
      </AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <span className="block">
          {intl.formatMessage(
            hasUnspecifiedLanguage
              ? messages.unspecifiedDescription
              : messages.missingDescription,
          )}
        </span>
        <NativeLink render={<Link href="/protocol/localization" />}>
          {intl.formatMessage(messages.goToLanguages)}
        </NativeLink>
      </AlertDescription>
    </Alert>
  );
};

export default LocalizationAlert;
