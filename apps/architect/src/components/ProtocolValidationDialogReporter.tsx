import { useEffect, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { useDialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { returnToStartScreenMessage } from '~/components/returnToStartScreenMessage';
import {
  collapseProtocolHistory,
  guardState,
} from '~/hooks/useProtocolNavGuard';
import {
  type ProtocolValidationDialogEvent,
  subscribeProtocolValidationDialogEvents,
  takeProtocolValidationDialogEvents,
} from '~/utils/protocolValidationDialogQueue';
const messages = defineMessages({
  misconfiguredProtocol: {
    id: 'architect.protocolValidationDialogReporter.misconfiguredProtocol',
    defaultMessage: 'Misconfigured Protocol',
    description:
      'Title of the dialog shown when the latest change left the open protocol invalid and editing cannot continue.',
  },
  theLatestChangeMadeThisProtocol: {
    id: 'architect.protocolValidationDialogReporter.theLatestChangeMadeThisProtocol',
    defaultMessage:
      'The latest change made this protocol invalid. Revert to the last valid state to continue editing, or return to the start screen.',
    description:
      'Body of the dialog titled Misconfigured Protocol. It offers two buttons: one reverts the protocol to its last valid state, the other returns to the start screen.',
  },
  revertToLastValidState: {
    id: 'architect.protocolValidationDialogReporter.revertToLastValidState',
    defaultMessage: 'Revert to Last Valid State',
    description:
      'Button in the Misconfigured Protocol dialog. Pressing it undoes the latest change by restoring the last valid state of the protocol so editing can continue.',
  },
  theProtocolContainsValidationErrors: {
    id: 'architect.protocolValidationDialogReporter.theProtocolContainsValidationErrors',
    defaultMessage: 'Technical details (English):',
    description:
      'Label above the box of technical validation errors in the Misconfigured Protocol dialog. The error text itself is always shown in English, which is what the word in brackets tells the reader.',
  },
  protocolValidationErrors: {
    id: 'architect.protocolValidationDialogReporter.protocolValidationErrors',
    defaultMessage: 'Protocol validation errors',
    description:
      'Accessible name of the scrollable box that lists the technical validation errors in the Misconfigured Protocol dialog; read only by screen readers.',
  },
});

type OpenEvent = Extract<ProtocolValidationDialogEvent, { type: 'open' }>;

const ProtocolValidationDialogReporter = () => {
  const intl = useAppIntl();
  // The event is held across the close so the dialog animates out: rendered
  // only while there was an event, closing unmounted it in the same tick and
  // took the `AnimatePresence` running the exit with it.
  const {
    session: currentEvent,
    openSession,
    closeSession,
    onSessionExited,
  } = useDialogSession<OpenEvent>();
  const currentEventRef = useRef<OpenEvent | null>(null);

  useEffect(() => {
    const consumeEvents = () => {
      for (const event of takeProtocolValidationDialogEvents()) {
        if (event.type === 'close') {
          if (currentEventRef.current?.id === event.id) {
            currentEventRef.current = null;
            closeSession();
          }
          continue;
        }

        currentEventRef.current = event;
        openSession(event);
      }
    };

    consumeEvents();
    return subscribeProtocolValidationDialogEvents(consumeEvents);
  }, [closeSession, openSession]);

  if (!currentEvent) return null;

  const finish = (action: () => void) => {
    const event = currentEvent;
    currentEventRef.current = null;
    closeSession();
    action();
    event.onClose();
  };

  const returnToStart = () => {
    const event = currentEvent;
    currentEventRef.current = null;
    closeSession();
    event.onReturnToStart();
    event.onClose();

    // Invalid recovery is already an explicit destructive choice, so bypass
    // the standard leave-editor prompt and remove the protocol session from
    // browser history. Back must not reopen the invalid editor state.
    guardState.bypass = true;
    const collapsed = collapseProtocolHistory('/', () => {
      history.replaceState(null, '', '/');
    });
    void Promise.resolve(collapsed).finally(() => {
      guardState.bypass = false;
    });
  };

  return (
    <Dialog
      open={currentEvent.open}
      onExitComplete={onSessionExited}
      dismissible={false}
      accent="destructive"
      title={intl.formatMessage(messages.misconfiguredProtocol)}
      description={intl.formatMessage(messages.theLatestChangeMadeThisProtocol)}
      footer={
        <>
          <Button onClick={returnToStart}>
            {intl.formatMessage(returnToStartScreenMessage)}
          </Button>
          <Button
            autoFocus
            color="destructive"
            onClick={() => finish(currentEvent.onRevert)}
          >
            {intl.formatMessage(messages.revertToLastValidState)}
          </Button>
        </>
      }
    >
      <Paragraph>
        {intl.formatMessage(messages.theProtocolContainsValidationErrors)}
      </Paragraph>
      <section
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region has to take focus for keyboard users to scroll it.
        tabIndex={0}
        aria-label={intl.formatMessage(messages.protocolValidationErrors)}
        className="bg-surface-1 max-h-64 overflow-auto rounded-sm p-4 text-sm"
      >
        <pre lang="en" dir="ltr" className="whitespace-pre-wrap">
          {currentEvent.errorMessage}
        </pre>
      </section>
    </Dialog>
  );
};

export default ProtocolValidationDialogReporter;
