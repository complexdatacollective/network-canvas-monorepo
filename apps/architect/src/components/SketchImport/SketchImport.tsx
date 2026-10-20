import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { isAllowedSketchOrigin } from '~/config/sketchOrigins';
import { useAppDispatch } from '~/ducks/hooks';
import {
  openSketchProtocol,
  type ProtocolOpenResult,
} from '~/ducks/modules/userActions/userActions';
import { PROTOCOL_OPEN_FAILURE_MESSAGE } from '~/utils/protocolImportErrors';
import { reportError } from '~/utils/reportError';

import {
  parseSketchMessage,
  readyMessage,
  resultMessage,
  type SketchImportResult,
  toExtractedAssets,
} from './messages';

const messages = defineMessages({
  receiving: {
    id: 'architect.sketchImport.receiving',
    defaultMessage: 'Receiving your protocol from Sketch…',
    description:
      'Heading shown while Architect waits for Sketch, a separate study-design website, to send it a protocol. Keep "Sketch" untranslated: it is a product name.',
  },
  noOpenerTitle: {
    id: 'architect.sketchImport.noOpenerTitle',
    defaultMessage: 'Open this page from Sketch',
    description:
      'Heading shown when the Sketch import page was opened directly rather than by Sketch, a separate study-design website. Keep "Sketch" untranslated: it is a product name.',
  },
  noOpenerBody: {
    id: 'architect.sketchImport.noOpenerBody',
    defaultMessage:
      'This page receives protocols sent from Sketch. Go back to Sketch and send your protocol to Architect from there.',
    description:
      'Explains that the Sketch import page only works when Sketch, a separate study-design website, opens it. Keep "Sketch" untranslated: it is a product name.',
  },
  timeoutTitle: {
    id: 'architect.sketchImport.timeoutTitle',
    defaultMessage: "Your protocol didn't arrive",
    description:
      'Heading shown when Sketch, a separate study-design website, opened Architect but never sent the protocol.',
  },
  errorTitle: {
    id: 'architect.sketchImport.errorTitle',
    defaultMessage: "Your protocol couldn't be opened",
    description:
      'Heading shown when a protocol sent from Sketch, a separate study-design website, arrived but could not be opened in Architect.',
  },
  tryAgainBody: {
    id: 'architect.sketchImport.tryAgainBody',
    defaultMessage:
      'Go back to Sketch and try again, or download the protocol there and open the file in Architect.',
    description:
      'Next steps after a protocol from Sketch, a separate study-design website, did not arrive or could not be opened. "Download" means saving it as a .netcanvas file. Keep "Sketch" untranslated: it is a product name.',
  },
  returnToStartScreen: {
    id: 'architect.sketchImport.returnToStartScreen',
    defaultMessage: 'Return to start screen',
    description:
      "Button that leaves the Sketch import page for Architect's start screen.",
  },
});

/** How often `ready` is re-posted while no payload has arrived. */
export const READY_INTERVAL_MS = 1_000;
/** How long to wait for Sketch's payload before giving up. */
export const PAYLOAD_TIMEOUT_MS = 30_000;

type ImportState = 'waiting' | 'importing' | 'timeout' | 'error';

// What Sketch is told when an import does not open. Sketch shows its own copy
// and offers the download, so this is a diagnostic, not researcher-facing text.
const describeFailure = (result: ProtocolOpenResult): string => {
  switch (result.status) {
    case 'error':
    case 'validation-error':
      return result.message;
    default:
      return PROTOCOL_OPEN_FAILURE_MESSAGE;
  }
};

/**
 * `/import-from-sketch`: receives a protocol from Sketch over postMessage and
 * opens it as a new library protocol.
 *
 * This page speaks first. It cannot know Sketch's origin before Sketch
 * answers, so `ready` goes to the opener with target origin `'*'` — safe
 * because it carries nothing. Only the reply is trusted, and only from the
 * window that opened this one at an allowlisted Sketch origin.
 */
export default function SketchImport() {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const [, setLocation] = useLocation();
  // Read once: the opener cannot appear later, and reading it on every render
  // would let a re-render race the effect below.
  const [opener] = useState(() => window.opener as Window | null);
  const [state, setState] = useState<ImportState>('waiting');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstState = useRef(true);
  // Set once a payload is accepted or the wait times out. Held outside the
  // effect so a re-run can never re-arm a handshake that has already ended.
  const settled = useRef(false);

  useEffect(() => {
    if (!opener || settled.current) return;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const stopAsking = () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled.current) return;
      if (event.source !== opener) return;
      if (!isAllowedSketchOrigin(event.origin, { dev: import.meta.env.DEV })) {
        return;
      }
      const parsed = parseSketchMessage(event.data);
      if (parsed.kind === 'ignore') return;

      settled.current = true;
      stopAsking();
      // Posted whatever happens to this component: a successful open
      // navigates to /protocol, unmounting this page before the thunk resolves.
      const origin = event.origin;
      const send = (message: SketchImportResult) => {
        opener.postMessage(message, origin);
      };

      if (parsed.kind === 'invalid') {
        send(
          resultMessage({
            status: 'error',
            message: 'Architect could not read the message Sketch sent.',
          }),
        );
        setState('error');
        return;
      }

      setState('importing');
      const { protocol, name, assets } = parsed.payload;
      void (async () => {
        let result: ProtocolOpenResult;
        try {
          result = await dispatch(
            openSketchProtocol({
              protocol,
              name,
              assets: toExtractedAssets(protocol, assets),
            }),
          ).unwrap();
        } catch (error) {
          reportError(error, { operation: 'sketchImport' });
          send(
            resultMessage({
              status: 'error',
              message: PROTOCOL_OPEN_FAILURE_MESSAGE,
            }),
          );
          setState('error');
          return;
        }
        if (result.status === 'opened') {
          send(resultMessage({ status: 'opened' }));
        } else {
          send(
            resultMessage({
              status: 'error',
              message: describeFailure(result),
            }),
          );
          setState('error');
        }
        await showProtocolOpenResultDialog({
          result,
          openDialog,
        });
      })();
    };

    window.addEventListener('message', onMessage);
    opener.postMessage(readyMessage, '*');
    intervalId = setInterval(() => {
      opener.postMessage(readyMessage, '*');
    }, READY_INTERVAL_MS);
    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      if (settled.current) return;
      settled.current = true;
      setState('timeout');
    }, PAYLOAD_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      stopAsking();
    };
  }, [opener, dispatch, openDialog]);

  // RouteFocus lands on the first heading. A later change of state replaces
  // that heading, so focus follows it to the new one rather than dropping to
  // <body> with nothing announced.
  // ('importing' keeps the waiting heading, so focus stays where it is.)
  useEffect(() => {
    if (isFirstState.current) {
      isFirstState.current = false;
      return;
    }
    if (state === 'importing') return;
    headingRef.current?.focus();
  }, [state]);

  const goHome = () => setLocation('/');

  const screen = (() => {
    if (!opener) {
      return {
        title: messages.noOpenerTitle,
        body: messages.noOpenerBody,
        busy: false,
      };
    }
    switch (state) {
      case 'timeout':
        return {
          title: messages.timeoutTitle,
          body: messages.tryAgainBody,
          busy: false,
        };
      case 'error':
        return {
          title: messages.errorTitle,
          body: messages.tryAgainBody,
          busy: false,
        };
      default:
        return { title: messages.receiving, body: null, busy: true };
    }
  })();

  return (
    <main
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 p-8 text-center"
      aria-busy={screen.busy}
    >
      {screen.busy && <Spinner />}
      <Heading
        ref={headingRef}
        level="h1"
        margin="none"
        className="max-w-2xl"
        {...routeFocusTargetProps}
      >
        {intl.formatMessage(screen.title)}
      </Heading>
      {screen.body && (
        <Paragraph margin="none" className="max-w-xl">
          {intl.formatMessage(screen.body)}
        </Paragraph>
      )}
      {!screen.busy && (
        <Button color="primary" onClick={goHome}>
          {intl.formatMessage(messages.returnToStartScreen)}
        </Button>
      )}
    </main>
  );
}
