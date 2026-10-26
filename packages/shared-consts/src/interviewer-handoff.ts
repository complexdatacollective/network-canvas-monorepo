/**
 * Architect's "Send to Interviewer": the postMessage contract between the two
 * web apps, and which deployment of each talks to which.
 *
 * It follows the handshake Sketch uses to send a protocol to Architect:
 *
 * 1. Architect opens Interviewer at `/?from=architect` in a new tab with
 *    `window.open`, keeping `window.opener` (never `noopener`).
 * 2. Interviewer posts `ready` to its opener every second until a payload
 *    arrives. It cannot know the opener's origin yet, so it targets `'*'`,
 *    which is safe because `ready` carries nothing.
 * 3. On the first `ready` from that tab at the Interviewer origin it opened,
 *    Architect replies once with the protocol as a `.netcanvas` file, targeted
 *    at that origin.
 * 4. Interviewer accepts a payload only from its opener, at an allowed
 *    Architect origin, and answers with a `result`. The file then waits for
 *    the researcher to unlock Interviewer and is imported like any other.
 *
 * Every message carries `version` so either side can refuse a shape it does
 * not know rather than misreading it. Production Architect and Interviewer
 * deploy separately, so a change here must stay readable by the other side's
 * live version, or bump the version.
 */

export const INTERVIEWER_HANDOFF_VERSION = 1;

/** The query parameter, and its value, Architect opens Interviewer with. */
export const INTERVIEWER_HANDOFF_PARAM = 'from';
export const INTERVIEWER_HANDOFF_PARAM_VALUE = 'architect';

export type InterviewerHandoffReady = {
  type: 'interviewer-handoff:ready';
  version: typeof INTERVIEWER_HANDOFF_VERSION;
};

export type InterviewerHandoffPayload = {
  type: 'interviewer-handoff:payload';
  version: typeof INTERVIEWER_HANDOFF_VERSION;
  /** The file name Interviewer shows while importing. Ends in `.netcanvas`. */
  fileName: string;
  /** The protocol, bundled exactly as Architect's Download writes it. */
  file: Blob;
};

export type InterviewerHandoffResult =
  | {
      type: 'interviewer-handoff:result';
      version: typeof INTERVIEWER_HANDOFF_VERSION;
      status: 'received';
    }
  | {
      type: 'interviewer-handoff:result';
      version: typeof INTERVIEWER_HANDOFF_VERSION;
      status: 'error';
    };

export const interviewerHandoffReady: InterviewerHandoffReady = {
  type: 'interviewer-handoff:ready',
  version: INTERVIEWER_HANDOFF_VERSION,
};

export const interviewerHandoffResult = (
  status: InterviewerHandoffResult['status'],
): InterviewerHandoffResult => ({
  type: 'interviewer-handoff:result',
  version: INTERVIEWER_HANDOFF_VERSION,
  status,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What a message Interviewer receives is.
 *
 * - `ignore`: not a hand-off payload at all (another script's message, or one
 *   of our own types travelling the wrong way). Dropped silently.
 * - `invalid`: claims to be a payload but has the wrong shape or version.
 *   Answered with an error, so Architect need not wait for its timeout.
 * - `payload`: the right shape. Whether the file is a protocol is for the
 *   import to decide.
 */
export type ParsedInterviewerHandoffMessage =
  | { kind: 'ignore' }
  | { kind: 'invalid' }
  | { kind: 'payload'; payload: InterviewerHandoffPayload };

export function parseInterviewerHandoffPayload(
  data: unknown,
): ParsedInterviewerHandoffMessage {
  if (!isRecord(data) || data.type !== 'interviewer-handoff:payload') {
    return { kind: 'ignore' };
  }
  const { version, fileName, file } = data;
  if (
    version !== INTERVIEWER_HANDOFF_VERSION ||
    typeof fileName !== 'string' ||
    !fileName.toLowerCase().endsWith('.netcanvas') ||
    !(file instanceof Blob)
  ) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'payload',
    payload: {
      type: 'interviewer-handoff:payload',
      version: INTERVIEWER_HANDOFF_VERSION,
      fileName,
      file,
    },
  };
}

/** What a message Architect receives from the Interviewer tab says. */
export function readInterviewerHandoffReply(
  data: unknown,
): 'ready' | 'received' | 'error' | undefined {
  if (!isRecord(data) || data.version !== INTERVIEWER_HANDOFF_VERSION) {
    return undefined;
  }
  if (data.type === 'interviewer-handoff:ready') return 'ready';
  if (data.type !== 'interviewer-handoff:result') return undefined;
  if (data.status === 'received') return 'received';
  if (data.status === 'error') return 'error';
  return undefined;
}

const ARCHITECT_PRODUCTION_ORIGIN = 'https://architect.networkcanvas.com';
const INTERVIEWER_PRODUCTION_ORIGIN = 'https://interviewer.networkcanvas.com';
const INTERVIEWER_DEVELOPER_ORIGIN = 'https://interviewer.networkcanvas.dev';
/** `pnpm --filter @codaco/interviewer dev` (see its vite.config.ts). */
const INTERVIEWER_LOCAL_DEV_ORIGIN = 'http://localhost:5180';

/**
 * The Interviewer that the Architect at `architectOrigin` sends to.
 *
 * Production Architect sends to production Interviewer. A local development
 * build sends to Interviewer's local dev server. Everything else (the
 * developer site, which tracks `main`, and pull-request previews) sends to
 * Interviewer's developer site: a preview of the matching pull request exists
 * only when that pull request changes Interviewer, so it cannot be relied on.
 */
export function interviewerOriginFor(
  architectOrigin: string,
  { dev }: { dev: boolean },
): string {
  if (dev) return INTERVIEWER_LOCAL_DEV_ORIGIN;
  if (architectOrigin === ARCHITECT_PRODUCTION_ORIGIN) {
    return INTERVIEWER_PRODUCTION_ORIGIN;
  }
  return INTERVIEWER_DEVELOPER_ORIGIN;
}

/** The address Architect opens to send a protocol to `interviewerOrigin`. */
export const interviewerHandoffUrl = (interviewerOrigin: string): string =>
  `${interviewerOrigin}/?${INTERVIEWER_HANDOFF_PARAM}=${INTERVIEWER_HANDOFF_PARAM_VALUE}`;

// Exact origins only: `MessageEvent.origin` is always scheme + host (+ port),
// so a prefix or substring check would admit look-alike hosts.
const ARCHITECT_ORIGINS: readonly string[] = [
  ARCHITECT_PRODUCTION_ORIGIN,
  'https://architect.networkcanvas.dev',
  'https://architect-dev.netlify.app',
];

// Netlify deploy previews and branch deploys of the developer site:
// `<label>--architect-dev`. Anchored at both ends, and the label cannot
// contain a dot, so no other host can end in this suffix and pass. A preview
// runs whatever code its pull request contains (fork pull requests included),
// so only a non-production Interviewer trusts one.
const ARCHITECT_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9-]+--architect-dev\.netlify\.app$/;

// A local dev or preview server, on whatever port Vite chose. Architect at
// one is trusted only by a development build of Interviewer.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

// The non-production Interviewers, which trust Architect previews: the
// developer site, its own previews, and local builds.
const isNonProductionInterviewer = (origin: string): boolean =>
  origin === INTERVIEWER_DEVELOPER_ORIGIN ||
  /^https:\/\/([a-z0-9-]+--)?interviewer-pwa-dev\.netlify\.app$/.test(origin) ||
  LOCAL_ORIGIN.test(origin);

/**
 * Whether the Interviewer at `interviewerOrigin` accepts a protocol from a
 * window at `architectOrigin`.
 */
export function isAllowedArchitectOrigin(
  architectOrigin: string,
  { interviewerOrigin, dev }: { interviewerOrigin: string; dev: boolean },
): boolean {
  if (ARCHITECT_ORIGINS.includes(architectOrigin)) return true;
  if (
    isNonProductionInterviewer(interviewerOrigin) &&
    ARCHITECT_PREVIEW_ORIGIN.test(architectOrigin)
  ) {
    return true;
  }
  return dev && LOCAL_ORIGIN.test(architectOrigin);
}
