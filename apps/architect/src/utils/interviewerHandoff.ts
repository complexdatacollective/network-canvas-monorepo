import {
  type InterviewerHandoffPayload,
  INTERVIEWER_HANDOFF_VERSION,
  interviewerHandoffUrl,
  interviewerOriginFor,
  readInterviewerHandoffReply,
} from '@codaco/shared-consts';

// Architect's side of "Send to Interviewer". The contract, and which
// Interviewer each Architect deployment sends to, live in
// `@codaco/shared-consts`' `interviewer-handoff`, beside the rules Interviewer
// uses to decide which Architects it trusts.

/** How long to wait for the tab to load and say it is ready. */
const READY_TIMEOUT_MS = 60_000;
/** How long to wait for Interviewer's answer once the protocol is sent. */
const RESULT_TIMEOUT_MS = 20_000;
const CLOSED_POLL_MS = 500;

export type InterviewerTab = {
  window: Window;
  /** The origin the tab was opened at, and the only one it is trusted from. */
  origin: string;
};

export type InterviewerHandoffOutcome = 'received' | 'not-reached' | 'error';

/**
 * Open the Interviewer that matches this Architect in a new tab, ready to
 * receive a protocol. Must run inside the click that asked for it, before any
 * `await`, or the browser blocks the tab. `null` when it was blocked anyway.
 *
 * The tab keeps `window.opener`, which the handshake needs, so `noopener`
 * must never be added.
 */
export function openInterviewerTab(
  host: Window = window,
): InterviewerTab | null {
  const origin = interviewerOriginFor(host.location.origin, {
    dev: import.meta.env.DEV,
  });
  const tab = host.open(interviewerHandoffUrl(origin), '_blank');
  return tab ? { window: tab, origin } : null;
}

type DeliverOptions = {
  readyTimeoutMs?: number;
  resultTimeoutMs?: number;
  /** The window that receives the tab's messages (tests pass one). */
  host?: Window;
};

type HandoffFile = { blob: Blob; fileName: string };

/**
 * Send a protocol to a tab `openInterviewerTab` opened, once the tab says it
 * is ready and the protocol is bundled, whichever comes last. Resolves with
 * Interviewer's answer, or `not-reached` when the tab never became ready,
 * stopped answering, or was closed first, or the protocol could not be
 * bundled (the caller explains that one).
 *
 * Call it as soon as the tab is open, with the bundle still in progress: the
 * tab only asks for the protocol for a limited time after it loads, so a
 * listener started after a slow bundle could miss every request.
 */
export function deliverToInterviewer(
  tab: InterviewerTab,
  file: Promise<HandoffFile>,
  {
    readyTimeoutMs = READY_TIMEOUT_MS,
    resultTimeoutMs = RESULT_TIMEOUT_MS,
    host = window,
  }: DeliverOptions = {},
): Promise<InterviewerHandoffOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let ready = false;
    let sent = false;
    let bundled: HandoffFile | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: InterviewerHandoffOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(closedPoll);
      host.removeEventListener('message', onMessage);
      resolve(outcome);
    };

    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish('not-reached'), ms);
    };

    const sendWhenBothArrive = () => {
      if (settled || sent || !ready || !bundled) return;
      sent = true;
      const payload: InterviewerHandoffPayload = {
        type: 'interviewer-handoff:payload',
        version: INTERVIEWER_HANDOFF_VERSION,
        fileName: bundled.fileName,
        file: bundled.blob,
      };
      tab.window.postMessage(payload, tab.origin);
      arm(resultTimeoutMs);
    };

    function onMessage(event: MessageEvent) {
      if (event.source !== tab.window || event.origin !== tab.origin) return;
      const reply = readInterviewerHandoffReply(event.data);
      if (reply === 'ready') {
        if (!ready) {
          ready = true;
          // The tab has loaded; from here only the bundle is awaited.
          clearTimeout(timer);
        }
        sendWhenBothArrive();
        return;
      }
      if (reply === 'received' || reply === 'error') finish(reply);
    }

    host.addEventListener('message', onMessage);
    arm(readyTimeoutMs);
    file.then(
      (value) => {
        bundled = value;
        sendWhenBothArrive();
      },
      () => finish('not-reached'),
    );
    // A tab the researcher closes settles straight away rather than at the
    // timeout.
    const closedPoll = setInterval(() => {
      if (tab.window.closed) finish('not-reached');
    }, CLOSED_POLL_MS);
  });
}
