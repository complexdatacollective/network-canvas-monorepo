import { useEffect, useRef, useState } from 'react';

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

type OpenEvent = Extract<ProtocolValidationDialogEvent, { type: 'open' }>;

const ProtocolValidationDialogReporter = () => {
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
      title="Misconfigured Protocol"
      description="The latest change made this protocol invalid. Revert to the last valid state to continue editing, or return to the start screen."
      footer={
        <>
          <Button onClick={returnToStart}>Return to Start Screen</Button>
          <Button
            autoFocus
            color="destructive"
            onClick={() => finish(currentEvent.onRevert)}
          >
            Revert to Last Valid State
          </Button>
        </>
      }
    >
      <Paragraph>The protocol contains validation errors:</Paragraph>
      <pre
        aria-label="Protocol validation errors"
        className="bg-surface-1 max-h-64 overflow-auto rounded-sm p-4 text-sm whitespace-pre-wrap"
      >
        {currentEvent.errorMessage}
      </pre>
    </Dialog>
  );
};

export default ProtocolValidationDialogReporter;
