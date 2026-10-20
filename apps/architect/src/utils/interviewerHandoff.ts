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

/**
 * Send a bundled protocol to a tab `openInterviewerTab` opened, once it says
 * it is ready. Resolves with Interviewer's answer, or `not-reached` when the
 * tab never became ready, stopped answering, or was closed first.
 */
export function deliverToInterviewer(
  tab: InterviewerTab,
  file: { blob: Blob; fileName: string },
  {
    readyTimeoutMs = READY_TIMEOUT_MS,
    resultTimeoutMs = RESULT_TIMEOUT_MS,
    host = window,
  }: DeliverOptions = {},
): Promise<InterviewerHandoffOutcome> {
  return new Promise((resolve) => {
    let sent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: InterviewerHandoffOutcome) => {
      clearTimeout(timer);
      clearInterval(closedPoll);
      host.removeEventListener('message', onMessage);
      resolve(outcome);
    };

    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish('not-reached'), ms);
    };

    function onMessage(event: MessageEvent) {
      if (event.source !== tab.window || event.origin !== tab.origin) return;
      const reply = readInterviewerHandoffReply(event.data);
      if (reply === 'ready') {
        if (sent) return;
        sent = true;
        const payload: InterviewerHandoffPayload = {
          type: 'interviewer-handoff:payload',
          version: INTERVIEWER_HANDOFF_VERSION,
          fileName: file.fileName,
          file: file.blob,
        };
        tab.window.postMessage(payload, tab.origin);
        arm(resultTimeoutMs);
        return;
      }
      if (reply === 'received' || reply === 'error') finish(reply);
    }

    host.addEventListener('message', onMessage);
    arm(readyTimeoutMs);
    // A tab the researcher closes settles straight away rather than at the
    // timeout.
    const closedPoll = setInterval(() => {
      if (tab.window.closed) finish('not-reached');
    }, CLOSED_POLL_MS);
  });
}
