import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import { returnToStartScreenMessage } from '~/components/returnToStartScreenMessage';
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
      if (
        !isAllowedSketchOrigin(event.origin, {
          dev: import.meta.env.DEV,
          // Set by apps/architect/netlify.toml for deploy previews and branch
          // deploys only; production never trusts a Sketch preview.
          allowPreviews:
            import.meta.env.DEV ||
            import.meta.env.VITE_ALLOW_SKETCH_PREVIEWS === 'true',
        })
      ) {
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

  // The waiting spinner has no heading, so when the wait ends in a timeout or
  // an error, focus moves to the new heading and the outcome is announced.
  useEffect(() => {
    if (state === 'timeout' || state === 'error') headingRef.current?.focus();
  }, [state]);

  // Only Sketch opens this page, so without an opener there is nothing to
  // receive: go straight to the start screen.
  useEffect(() => {
    if (!opener) setLocation('/', { replace: true });
  }, [opener, setLocation]);

  // Replace rather than push: Back must not return to this one-shot route,
  // which would wait for a handoff Sketch has already finished.
  const goHome = () => setLocation('/', { replace: true });

  if (!opener) return null;

  // While waiting, show the same bare spinner as opening a protocol file.
  if (state === 'waiting' || state === 'importing') {
    return (
      <main
        className="flex min-h-dvh w-full items-center justify-center"
        aria-busy
        aria-label={intl.formatMessage(commonMessages.loading)}
      >
        <Spinner />
      </main>
    );
  }

  const title =
    state === 'timeout' ? messages.timeoutTitle : messages.errorTitle;

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 p-8 text-center">
      <Heading
        ref={headingRef}
        level="h1"
        margin="none"
        className="max-w-2xl"
        {...routeFocusTargetProps}
      >
        {intl.formatMessage(title)}
      </Heading>
      <Paragraph margin="none" className="max-w-xl">
        {intl.formatMessage(messages.tryAgainBody)}
      </Paragraph>
      <Button color="primary" onClick={goHome}>
        {intl.formatMessage(returnToStartScreenMessage)}
      </Button>
    </main>
  );
}
