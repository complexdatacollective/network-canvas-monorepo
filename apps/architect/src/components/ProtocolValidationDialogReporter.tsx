import { useEffect } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ExternalLink from '~/components/ExternalLink';
import {
  subscribeProtocolValidationDialogEvents,
  takeProtocolValidationDialogEvents,
} from '~/utils/protocolValidationDialogQueue';

const ProtocolValidationDialogReporter = () => {
  const { closeDialog, openDialog } = useDialog();

  useEffect(() => {
    const showValidationDialogs = () => {
      const events = takeProtocolValidationDialogEvents();

      for (const event of events) {
        if (event.type === 'close') {
          queueMicrotask(() => void closeDialog(event.id, null));
          continue;
        }

        void (async () => {
          const result = await openDialog({
            id: event.id,
            type: 'acknowledge',
            intent: 'destructive',
            title: 'Misconfigured Protocol',
            children: (
              <>
                <p>The protocol contains validation errors:</p>
                <pre className="bg-surface-1 max-h-64 overflow-auto rounded-sm p-4 text-sm">
                  {event.errorMessage}
                </pre>

                <p className="text-sm">
                  You can revert to the last valid state to fix this issue. If
                  the problem persists, please reach out on our&nbsp;
                  <ExternalLink href="https://community.networkcanvas.com/">
                    community website.
                  </ExternalLink>
                </p>
              </>
            ),
            actions: {
              primary: {
                label: 'Revert to Last Valid State',
                value: true,
              },
            },
          });

          if (result === true) {
            event.onConfirm();
          }
          event.onClose();
        })();
      }
    };

    showValidationDialogs();
    return subscribeProtocolValidationDialogEvents(showValidationDialogs);
  }, [closeDialog, openDialog]);

  return null;
};

export default ProtocolValidationDialogReporter;
