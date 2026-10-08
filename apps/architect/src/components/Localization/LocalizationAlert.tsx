import { useEffect, useRef } from 'react';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { sortByLanguageName } from '@codaco/protocol-validation';
import { focusRouteTarget } from '~/components/RouteFocus';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  dismissMissingTranslations,
  getActiveProtocolId,
  getDismissedMissingTranslations,
} from '~/ducks/modules/app';
import { getLocalizationCoverage } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import { translationTableHref } from './translationTableLinks';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  missingTitle: {
    id: 'architect.localization.localizationAlert.missingTitle',
    defaultMessage: 'Not everything is translated yet',
    description:
      'Title of the informational notice on the stage list shown while some of the protocol’s text has no translation in one or more of its languages.',
  },
  missingDescription: {
    id: 'architect.localization.localizationAlert.missingDescription',
    defaultMessage:
      'Some text isn’t translated into {languages} yet. Participants see it in another language instead.',
    description:
      'Notice shown while some of the protocol’s text has no translation in one or more of its languages. languages is the list of those languages, already joined in the reader’s language, for example “French, German and Tibetan”.',
  },
  showMissing: {
    id: 'architect.localization.localizationAlert.showMissing',
    defaultMessage: 'Show missing translations',
    description:
      'Link in the note about missing translations on the stage list. It opens the translation table showing only the texts with a translation missing.',
  },
  dismissMissing: {
    id: 'architect.localization.localizationAlert.dismissMissing',
    defaultMessage: 'Dismiss the note about missing translations',
    description:
      'Accessible name of the button that hides the note about missing translations on the stage list. The note comes back if more translations go missing.',
  },
});

/**
 * Stage-list note naming the languages some text is not translated into. It
 * does not stop the protocol being saved or used.
 *
 * The note can be dismissed, because a protocol may be translated in part on
 * purpose. The dismissal is remembered with the number of translations missing
 * at that moment, so the note returns once there are more.
 */
const LocalizationAlert = () => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const dispatch = useAppDispatch();
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
  const showsMissing = missingCount > 0 && !isDismissed;
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

  if (!showsMissing) return null;

  const languagesWithGaps = sortByLanguageName(
    [...new Set(warnings.map((warning) => warning.locale))],
    languageName,
    intl.locale,
  );

  const handleDismiss = () => {
    if (protocolId === null) return;
    focusOnRemoval.current = true;
    dispatch(dismissMissingTranslations(protocolId, missingCount));
  };

  return (
    <Alert variant="info" className="mx-auto mb-10 max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <AlertTitle className="mb-0! min-w-0 flex-1">
          {intl.formatMessage(messages.missingTitle)}
        </AlertTitle>
        {protocolId !== null && (
          <CloseButton
            color="info"
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
          {intl.formatMessage(messages.missingDescription, {
            languages: intl.formatList(languagesWithGaps.map(languageName), {
              type: 'conjunction',
            }),
          })}
        </span>
        <NativeLink
          render={<Link href={translationTableHref({ kind: 'any' })} />}
        >
          {intl.formatMessage(messages.showMissing)}
        </NativeLink>
      </AlertDescription>
    </Alert>
  );
};

export default LocalizationAlert;
