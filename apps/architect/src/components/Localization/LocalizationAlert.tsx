import { useEffect, useRef } from 'react';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { focusRouteTarget } from '~/components/RouteFocus';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  dismissMissingTranslations,
  getActiveProtocolId,
  getDismissedMissingTranslations,
} from '~/ducks/modules/app';
import {
  getHasUnspecifiedLanguage,
  getLocalizationCoverage,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

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
  dismissMissing: {
    id: 'architect.localization.localizationAlert.dismissMissing',
    defaultMessage: 'Dismiss missing translations warning',
    description:
      'Accessible name of the button that hides the missing-translations warning on the stage list. The warning comes back if more translations go missing.',
  },
});

/**
 * Stage-list notice about the protocol's languages: text whose language is
 * not identified yet, or else missing translations. A warning only; neither
 * stops the protocol being saved or used.
 *
 * Missing translations can be dismissed, because a protocol may be translated
 * in part on purpose. The dismissal is remembered with the number of
 * translations missing at that moment, so the warning returns once there are
 * more. The unidentified-language notice cannot be dismissed: the researcher
 * has to act on it before translating.
 */
const LocalizationAlert = () => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const hasUnspecifiedLanguage = useAppSelector(getHasUnspecifiedLanguage);
  const { warnings } = useAppSelector(getLocalizationCoverage);
  const hasProtocol = useAppSelector(getProtocol) !== null;
  const protocolId = useAppSelector(getActiveProtocolId);
  const dismissedAt = useAppSelector((state) =>
    protocolId === null
      ? null
      : getDismissedMissingTranslations(state, protocolId),
  );

  const missingCount = warnings.length;
  const isDismissed = dismissedAt !== null && missingCount <= dismissedAt;
  const showsMissing =
    !hasUnspecifiedLanguage && missingCount > 0 && !isDismissed;
  const focusOnRemoval = useRef(false);

  // Dismissing removes the button that holds focus, which would drop it to
  // the document body. Wait until the button is gone, then hand focus to the
  // page heading, the same landing point a route change uses.
  useEffect(() => {
    if (showsMissing || !focusOnRemoval.current) return;
    focusOnRemoval.current = false;
    focusRouteTarget();
  }, [showsMissing]);

  // Follows the count down, so gaps that appear after a partial fix are
  // measured against what is missing now rather than what was missing when the
  // warning was dismissed. Runs while the alert renders nothing, and waits for
  // the protocol to load: with none, the count reads zero and would erase a
  // dismissal that is still valid.
  useEffect(() => {
    if (
      !hasProtocol ||
      protocolId === null ||
      dismissedAt === null ||
      missingCount >= dismissedAt
    ) {
      return;
    }
    dispatch(dismissMissingTranslations(protocolId, missingCount));
  }, [dispatch, hasProtocol, protocolId, dismissedAt, missingCount]);

  if (!hasUnspecifiedLanguage && !showsMissing) return null;

  const handleDismiss = () => {
    if (protocolId === null) return;
    focusOnRemoval.current = true;
    dispatch(dismissMissingTranslations(protocolId, missingCount));
  };

  return (
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <AlertTitle className="mb-0! min-w-0 flex-1">
          {hasUnspecifiedLanguage
            ? intl.formatMessage(messages.unspecifiedTitle)
            : intl.formatMessage(messages.missingTitle, {
                count: missingCount,
              })}
        </AlertTitle>
        {showsMissing && protocolId !== null && (
          <CloseButton
            color="warning"
            variant="default-inverted"
            size="sm"
            className="-my-2.5"
            title={intl.formatMessage(messages.dismissMissing)}
            onClick={handleDismiss}
          />
        )}
      </div>
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
