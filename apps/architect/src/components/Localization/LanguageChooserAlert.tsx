import { useEffect, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { focusRouteTarget } from '~/components/RouteFocus';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  dismissLanguageChooserNote,
  getActiveProtocolId,
  getLanguageChooserNoteDismissed,
} from '~/ducks/modules/app';
import { getLacksLanguageChooser } from '~/selectors/issues';

const messages = defineMessages({
  title: {
    id: 'architect.localization.languageChooserAlert.title',
    defaultMessage: 'Participants can’t choose a language',
    description:
      'Title of the note on the stage list shown while the protocol has more than one language but no Language Chooser stage.',
  },
  description: {
    id: 'architect.localization.languageChooserAlert.description',
    defaultMessage:
      'This protocol has more than one language but no Language Chooser stage. Each interview opens in the language that best matches the participant’s browser settings. Add a Language Chooser stage if participants should choose the language themselves.',
    description:
      'Note shown while the protocol has more than one language but no Language Chooser stage. "Language Chooser" is the name of a stage type in the list of stages a researcher can add, so translate it the same way as that name.',
  },
  dismiss: {
    id: 'architect.localization.languageChooserAlert.dismiss',
    defaultMessage:
      'Dismiss the note that participants can’t choose a language',
    description:
      'Accessible name of the button that hides the note saying participants can’t choose a language. The note stays hidden for this protocol.',
  },
});

/**
 * Stage-list note shown while the protocol has several languages but no
 * Language Chooser stage. Leaving the stage out is valid, since each interview
 * then opens in the language that best matches the participant's browser, so
 * the note can be dismissed for good.
 */
const LanguageChooserAlert = () => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const lacksLanguageChooser = useAppSelector(getLacksLanguageChooser);
  const protocolId = useAppSelector(getActiveProtocolId);
  const isDismissed = useAppSelector(
    (state) =>
      protocolId !== null && getLanguageChooserNoteDismissed(state, protocolId),
  );
  const isShown = lacksLanguageChooser && !isDismissed;
  const focusOnRemoval = useRef(false);

  // Dismissing removes the button that holds focus. Once it is gone, hand
  // focus to the page heading, as the missing-translations note does.
  useEffect(() => {
    if (isShown || !focusOnRemoval.current) return;
    focusOnRemoval.current = false;
    focusRouteTarget();
  }, [isShown]);

  if (!isShown) return null;

  const handleDismiss = () => {
    if (protocolId === null) return;
    focusOnRemoval.current = true;
    dispatch(dismissLanguageChooserNote(protocolId));
  };

  return (
    <Alert variant="info" className="mx-auto mb-10 max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <AlertTitle className="mb-0! min-w-0 flex-1">
          {intl.formatMessage(messages.title)}
        </AlertTitle>
        {protocolId !== null && (
          <CloseButton
            color="info"
            variant="default-inverted"
            size="sm"
            className="-my-2.5"
            title={intl.formatMessage(messages.dismiss)}
            onClick={handleDismiss}
          />
        )}
      </div>
      <AlertDescription className="text-sm">
        {intl.formatMessage(messages.description)}
      </AlertDescription>
    </Alert>
  );
};

export default LanguageChooserAlert;
