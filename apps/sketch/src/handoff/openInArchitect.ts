// The postMessage handoff to Architect's /import-from-sketch page.
//
// 1. Open the page in a new tab, keeping window.opener (never 'noopener').
// 2. The page posts {type:'sketch-import:ready', version:1} to its opener
//    every second until it has a payload.
// 3. On the first ready from that tab and Architect's origin, reply once with
//    the protocol and its assets, targeted at Architect's origin.
// 4. Architect answers {type:'sketch-import:result', status:'opened'|'error'}.
// 5. Without a ready within 60 s (which has to cover Architect's cold load
//    plus its own 30 s payload wait), or a result within 20 s of the payload,
//    give up so the page can offer the .netcanvas download instead. A tab
//    the researcher closes settles straight away.

import type { GeneratedAsset } from '../shared/api.ts';
import { ARCHITECT_URL, IMPORT_PATH } from './architectUrl.ts';

export type HandoffOutcome = 'opened' | 'blocked' | 'timeout' | 'error';

export type HandoffAsset = { id: string; name: string; data: Blob };

export type SketchImportPayload = {
  type: 'sketch-import:payload';
  version: 1;
  protocol: Record<string, unknown>;
  name: string;
  assets: HandoffAsset[];
};

export type OpenInArchitectInput = {
  protocol: Record<string, unknown>;
  name: string;
  assets: GeneratedAsset[];
};

export type OpenInArchitectOptions = {
  architectUrl?: string;
  // How long to wait for Architect's result once the payload is sent.
  timeoutMs?: number;
  // How long to wait for the tab to load and say it is ready.
  readyTimeoutMs?: number;
  // The window that opens the tab and receives its messages (tests pass one).
  host?: Window;
  // Called with Architect's message when it reports an error.
  onError?: (message: string) => void;
};

export const HANDOFF_TIMEOUT_MS = 20_000;
export const READY_TIMEOUT_MS = 60_000;
const CLOSED_POLL_MS = 500;

const toHandoffAssets = (assets: GeneratedAsset[]): HandoffAsset[] =>
  assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    data: new Blob([asset.content], { type: asset.mimeType }),
  }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const openInArchitect = (
  input: OpenInArchitectInput,
  options: OpenInArchitectOptions = {},
): Promise<HandoffOutcome> => {
  const host = options.host ?? window;
  const architectUrl = options.architectUrl ?? ARCHITECT_URL;
  const timeoutMs = options.timeoutMs ?? HANDOFF_TIMEOUT_MS;
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
  const architectOrigin = new URL(architectUrl).origin;

  const popup = host.open(
    new URL(IMPORT_PATH, architectUrl).toString(),
    '_blank',
  );
  if (!popup) return Promise.resolve('blocked');

  return new Promise<HandoffOutcome>((resolve) => {
    let sent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closedPoll: ReturnType<typeof setInterval> | undefined;

    const finish = (outcome: HandoffOutcome) => {
      clearTimeout(timer);
      clearInterval(closedPoll);
      host.removeEventListener('message', onMessage);
      resolve(outcome);
    };

    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish('timeout'), ms);
    };

    function onMessage(event: MessageEvent) {
      if (event.source !== popup || event.origin !== architectOrigin) return;
      const data: unknown = event.data;
      if (!isRecord(data) || data.version !== 1) return;

      if (data.type === 'sketch-import:ready') {
        if (sent) return;
        sent = true;
        const payload: SketchImportPayload = {
          type: 'sketch-import:payload',
          version: 1,
          protocol: input.protocol,
          name: input.name,
          assets: toHandoffAssets(input.assets),
        };
        popup?.postMessage(payload, architectOrigin);
        arm(timeoutMs);
        return;
      }

      if (data.type === 'sketch-import:result') {
        if (data.status === 'opened') {
          finish('opened');
        } else if (data.status === 'error') {
          options.onError?.(
            typeof data.message === 'string' ? data.message : '',
          );
          finish('error');
        }
      }
    }

    host.addEventListener('message', onMessage);
    arm(readyTimeoutMs);
    closedPoll = setInterval(() => {
      if (popup.closed) finish('timeout');
    }, CLOSED_POLL_MS);
  });
};
