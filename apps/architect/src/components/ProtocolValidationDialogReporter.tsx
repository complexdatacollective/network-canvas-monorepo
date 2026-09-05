import { useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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
      'The title text in components / ProtocolValidationDialogReporter.',
  },
  theLatestChangeMadeThisProtocol: {
    id: 'architect.protocolValidationDialogReporter.theLatestChangeMadeThisProtocol',
    defaultMessage:
      'The latest change made this protocol invalid. Revert to the last valid state to continue editing, or return to the start screen.',
    description:
      'The description text in components / ProtocolValidationDialogReporter.',
  },
  returnToStartScreen: {
    id: 'architect.protocolValidationDialogReporter.returnToStartScreen',
    defaultMessage: 'Return to Start Screen',
    description:
      'Visible text in components / ProtocolValidationDialogReporter.',
  },
  revertToLastValidState: {
    id: 'architect.protocolValidationDialogReporter.revertToLastValidState',
    defaultMessage: 'Revert to Last Valid State',
    description:
      'Visible text in components / ProtocolValidationDialogReporter.',
  },
  theProtocolContainsValidationErrors: {
    id: 'architect.protocolValidationDialogReporter.theProtocolContainsValidationErrors',
    defaultMessage: 'Technical details (English):',
    description:
      'Visible text in components / ProtocolValidationDialogReporter.',
  },
  protocolValidationErrors: {
    id: 'architect.protocolValidationDialogReporter.protocolValidationErrors',
    defaultMessage: 'Protocol validation errors',
    description:
      'The aria-label text in components / ProtocolValidationDialogReporter.',
  },
});

type OpenEvent = Extract<ProtocolValidationDialogEvent, { type: 'open' }>;

const ProtocolValidationDialogReporter = () => {
  const intl = useAppIntl();
  const [currentEvent, setCurrentEvent] = useState<OpenEvent | null>(null);
  const currentEventRef = useRef<OpenEvent | null>(null);

  useEffect(() => {
    const consumeEvents = () => {
      for (const event of takeProtocolValidationDialogEvents()) {
        if (event.type === 'close') {
          if (currentEventRef.current?.id === event.id) {
            currentEventRef.current = null;
            setCurrentEvent(null);
          }
          continue;
        }

        currentEventRef.current = event;
        setCurrentEvent(event);
      }
    };

    consumeEvents();
    return subscribeProtocolValidationDialogEvents(consumeEvents);
  }, []);

  if (!currentEvent) return null;

  const finish = (action: () => void) => {
    const event = currentEvent;
    currentEventRef.current = null;
    setCurrentEvent(null);
    action();
    event.onClose();
  };

  const returnToStart = () => {
    const event = currentEvent;
    currentEventRef.current = null;
    setCurrentEvent(null);
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
      open
      dismissible={false}
      accent="destructive"
      title={intl.formatMessage(messages.misconfiguredProtocol)}
      description={intl.formatMessage(messages.theLatestChangeMadeThisProtocol)}
      footer={
        <>
          <Button onClick={returnToStart}>
            {intl.formatMessage(messages.returnToStartScreen)}
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
      <pre
        lang="en"
        dir="ltr"
        tabIndex={0}
        role="region"
        aria-label={intl.formatMessage(messages.protocolValidationErrors)}
        className="bg-surface-1 max-h-64 overflow-auto rounded-sm p-4 text-sm whitespace-pre-wrap"
      >
        {currentEvent.errorMessage}
      </pre>
    </Dialog>
  );
};

export default ProtocolValidationDialogReporter;
