import {
  interviewerHandoffReady,
  interviewerHandoffResult,
  isAllowedArchitectOrigin,
  parseInterviewerHandoffPayload,
} from '@codaco/shared-consts';

import { queueLaunchFileRead } from '../pwa/fileLaunchQueue';
import { takeArchitectRequest } from './urlEntryRequests';

/** How often `ready` is re-posted while no payload has arrived. */
const READY_INTERVAL_MS = 1_000;
/**
 * How long to wait for Architect's payload before giving up. Architect bundles
 * the protocol while this tab loads, and a protocol with large resources can
 * take a while to bundle, so this is generous.
 */
export const PAYLOAD_TIMEOUT_MS = 300_000;

/**
 * Receive the protocol Architect's "Send to Interviewer" opened this tab for
 * (`/?from=architect`, captured before analytics by `captureUrlEntryRequests`;
 * the contract is in `@codaco/shared-consts`' `interviewer-handoff`).
 *
 * Runs before React mounts, because the vault is locked in a new tab and may
 * not even be set up yet: the file joins the OS-launched files, waits for the
 * researcher to unlock (or finish setting up) Interviewer, and is imported on
 * Home like a file they opened themselves.
 *
 * This page speaks first. It cannot know Architect's origin before Architect
 * answers, so `ready` goes to the opener with target origin `'*'`, which is
 * safe because it carries nothing. Only the reply is trusted, and only from
 * the window that opened this one at an allowed Architect origin.
 */
export function startArchitectHandoff(win: Window = window): void {
  if (!takeArchitectRequest()) return;
  // Read once: the opener cannot appear later.
  const openerOrNull: Window | null = win.opener;
  if (!openerOrNull) return;
  const opener = openerOrNull;

  let settled = false;

  const stop = () => {
    settled = true;
    win.clearInterval(intervalId);
    win.clearTimeout(timeoutId);
    win.removeEventListener('message', onMessage);
  };

  function onMessage(event: MessageEvent) {
    if (settled || event.source !== opener) return;
    if (
      !isAllowedArchitectOrigin(event.origin, {
        interviewerOrigin: win.location.origin,
        dev: import.meta.env.DEV,
      })
    ) {
      return;
    }
    const parsed = parseInterviewerHandoffPayload(event.data);
    if (parsed.kind === 'ignore') return;

    stop();
    if (parsed.kind === 'invalid') {
      opener.postMessage(interviewerHandoffResult('error'), event.origin);
      return;
    }

    const { file, fileName } = parsed.payload;
    queueLaunchFileRead(() =>
      Promise.resolve(
        new File([file], fileName, { type: file.type || 'application/zip' }),
      ),
    );
    opener.postMessage(interviewerHandoffResult('received'), event.origin);
  }

  const askForPayload = () => {
    try {
      opener.postMessage(interviewerHandoffReady, '*');
    } catch {
      // The opener navigated away or closed: nobody is left to answer.
      stop();
    }
  };

  win.addEventListener('message', onMessage);
  const intervalId = win.setInterval(askForPayload, READY_INTERVAL_MS);
  const timeoutId = win.setTimeout(stop, PAYLOAD_TIMEOUT_MS);
  askForPayload();
}
